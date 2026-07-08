require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Groq = require('groq-sdk');
const fs = require('fs');
const path = require('path');
const rateLimit = require('express-rate-limit');

const app = express();
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const allowedOrigins = [
  'https://clever-clafoutis-cca8e4.netlify.app',
  'http://127.0.0.1:5500',
  'http://localhost:5500'
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
}));
app.use(express.json());

// ── RATE LIMITING ──
const chatLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  message: { error: "You're sending messages too quickly. Please wait a few minutes and try again." },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── ANALYTICS LOGGING SETUP ──
const LOG_FILE = path.join(__dirname, 'chat_logs.json');

function readLogs() {
  try {
    if (fs.existsSync(LOG_FILE)) {
      return JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Error reading logs:', e);
  }
  return [];
}

function saveLog(entry) {
  let logs = readLogs();
  logs.push(entry);

  const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
  logs = logs.filter(log => new Date(log.timestamp).getTime() > sevenDaysAgo);

  fs.writeFileSync(LOG_FILE, JSON.stringify(logs, null, 2));
}

// ── SYSTEM PROMPT ──
const SALIX_SYSTEM_PROMPT = `
You are Sage, a friendly and knowledgeable assistant for SALIX Data — 
a company founded in 1999 in Cincinnati, Ohio, that leverages artificial intelligence 
and human expertise to solve data challenges. SALIX celebrated 25 years in 2024 and has 
worked with over 2,500 clients, including top healthcare companies, law firms, and 
Fortune 500 companies like Northwestern Mutual and Ohio National.

Your job is to help website visitors understand what SALIX Data does, what solutions 
they offer, and how to get in touch with the right team.

== ABOUT SALIX DATA ==
SALIX Data is an IT services and consulting company (51-200 employees) specializing in:
- Artificial Intelligence: fraud detection, predictive analytics, intelligent automation, AI-driven chatbots and virtual assistants, sentiment analysis
- Robotic Process Automation (RPA): automating repetitive, mundane tasks using intelligent software
- Automated Workflow Solutions: streamlining task assignment and collaboration
- Business Process Outsourcing (BPO): call center services (onshore/offshore), medical billing
- Cyber Security: using certified ethical hackers to monitor and protect client systems
- Litigation Support, E-Discovery & Computer Forensics: 12+ years serving the legal community
- Data Science: data strategy, governance, privacy compliance, AI readiness

== INDUSTRIES SERVED (with specific solutions) ==
- Banking: fraud detection, transaction monitoring, predictive loan risk analytics, automated onboarding
- Healthcare: clinical decision support, predictive patient outcomes, claims processing, 24/7 support
- Legal: e-discovery, litigation support, trial technology and visual presentations
- Construction: subcontractor performance analysis, predictive risk assessments, project forecasting
- Manufacturing: production efficiency, waste reduction, predictive quality control
- Insurance: fraud prevention, underwriting automation, claims processing
- Public Sector & Corporate

== THE SALIX WAY (their process) ==
SALIX always starts with Discovery — deeply understanding a client's specific operations, 
workflows, and pain points before proposing solutions. They act as an extension of the 
client's own team, providing ongoing 24/7 support rather than a one-time project handoff.

== CONTACT ==
- Kenya: +254-710-243-400
- Cincinnati HQ: (513) 381-2679
- Address: 4030 Smith Road, Suite 325, Cincinnati, Ohio 45209

== HOW TO BEHAVE ==
- Be friendly, clear, and professional — knowledgeable but approachable
- Keep answers concise but complete
- Format longer answers clearly: use short paragraphs (2-3 sentences max) separated by line breaks
- When listing multiple items (services, industries), use a bullet point on its own line starting with "•"
- Never write one giant wall of text — break information into digestible chunks
- If someone asks about pricing, tell them SALIX Data provides custom consultations — direct them to schedule one
- If asked about a specific industry, reference the relevant tailored solutions above
- Never make up information. If you don't know, say so and offer the contact details
- Always end complex answers with an invitation to contact SALIX Data for more details
- Do not discuss competitors or anything outside SALIX Data's services
`;

// ── CHAT ROUTE (with streaming + rate limiting) ──
app.post('/chat', chatLimiter, async (req, res) => {
  const { message, history } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  try {
    saveLog({
      question: message,
      timestamp: new Date().toISOString()
    });

    const messages = [
      { role: 'system', content: SALIX_SYSTEM_PROMPT },
      ...history,
      { role: 'user', content: message }
    ];

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const stream = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: messages,
      max_tokens: 500,
      temperature: 0.7,
      stream: true
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();

  } catch (error) {
    console.error('Groq API error:', error);
    res.write(`data: ${JSON.stringify({ error: 'Something went wrong. Please try again.' })}\n\n`);
    res.end();
  }
});

// ── ANALYTICS ROUTE ──
app.get('/analytics', (req, res) => {
  const logs = readLogs();

  res.json({
    totalConversations: logs.length,
    recentQuestions: logs.slice(-20).reverse(),
    logs: logs
  });
});

// ── HEALTH CHECK ──
app.get('/', (req, res) => {
  res.json({ status: 'SALIX Data Chatbot backend is running' });
});

// ── START SERVER ──
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`SALIX Data Chatbot server running on port ${PORT}`);
});
// ── CONFIG ──
const BACKEND_URL = 'https://salix-chatbot-backend.onrender.com/chat';

// Generate floating particles for background
const pageBg = document.getElementById('pageBg');
for (let i = 0; i < 18; i++) {
  const p = document.createElement('div');
  p.className = 'particle';
  p.style.left = Math.random() * 100 + '%';
  p.style.bottom = '-10px';
  p.style.animationDuration = (8 + Math.random() * 8) + 's';
  p.style.animationDelay = (Math.random() * 8) + 's';
  pageBg.appendChild(p);
}

// ── GRAB ELEMENTS ──
const bubbleBtn = document.getElementById('bubbleBtn');
const unreadBadge = document.getElementById('unreadBadge');
const chatWindow = document.getElementById('chatWindow');
const closeBtn = document.getElementById('closeBtn');
const messagesEl = document.getElementById('messages');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');

// ── STATE ──
let conversationHistory = [];   // sent to backend for context
let chatOpened = false;         // tracks first open

// ── START: chat window starts hidden ──
chatWindow.classList.add('hidden');

// ── HELPER: get current time like "10:42 AM" ──
function getTime() {
  const now = new Date();
  let hours = now.getHours();
  const minutes = now.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${hours}:${minutes} ${ampm}`;
}

// ── HELPER: add a message bubble to the chat ──
function formatMessage(text) {
  // Escape HTML first to prevent injection issues
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Split into lines, wrap bullets and paragraphs properly
  const lines = escaped.split('\n').filter(line => line.trim() !== '');

  let html = '';
  let inList = false;

  lines.forEach(line => {
    const trimmed = line.trim();
    if (trimmed.startsWith('•')) {
      if (!inList) {
        html += '<ul>';
        inList = true;
      }
      html += `<li>${trimmed.slice(1).trim()}</li>`;
    } else {
      if (inList) {
        html += '</ul>';
        inList = false;
      }
      html += `<p>${trimmed}</p>`;
    }
  });

  if (inList) html += '</ul>';

  return html;
}

function addMessage(text, type) {
  const msg = document.createElement('div');
  msg.className = 'message ' + type;

  if (type === 'bot') {
    msg.innerHTML = formatMessage(text);

    // Add copy button for bot messages
    const copyBtn = document.createElement('button');
    copyBtn.className = 'copy-btn';
    copyBtn.innerHTML = '📋';
    copyBtn.title = 'Copy response';
    copyBtn.onclick = () => {
      navigator.clipboard.writeText(text);
      copyBtn.innerHTML = '✓';
      setTimeout(() => { copyBtn.innerHTML = '📋'; }, 1500);
    };
    msg.appendChild(copyBtn);
    msg.style.position = 'relative';
  } else {
    msg.textContent = text;
  }

  messagesEl.appendChild(msg);

  const time = document.createElement('div');
  time.className = 'timestamp';
  time.textContent = getTime();
  messagesEl.appendChild(time);

  messagesEl.scrollTop = messagesEl.scrollHeight;
}
// ── HELPER: add suggestion chips (only shown once, at the start) ──
function addChips() {
  const chipsWrap = document.createElement('div');
  chipsWrap.className = 'chips';
  chipsWrap.id = 'chips';

const suggestions = [
  'What does SALIX Data do?',
  'AI & Automation services',
  'Contact the team'
];
  suggestions.forEach(text => {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = text;
    chip.onclick = () => {
      chipsWrap.remove();
      sendMessage(text);
    };
    chipsWrap.appendChild(chip);
  });

  messagesEl.appendChild(chipsWrap);
}

// ── HELPER: show typing indicator ──
function showTyping() {
  const typing = document.createElement('div');
  typing.className = 'typing';
  typing.id = 'typingIndicator';
  typing.innerHTML = '<span></span><span></span><span></span>';
  messagesEl.appendChild(typing);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function removeTyping() {
  const typing = document.getElementById('typingIndicator');
  if (typing) typing.remove();
}

async function sendMessage(text) {
  if (!text.trim()) return;

  // Show user's message immediately
  addMessage(text, 'user');
  conversationHistory.push({ role: 'user', content: text });

  // Create an empty bot message bubble that we'll fill in as chunks arrive
  const msgEl = document.createElement('div');
  msgEl.className = 'message bot';
  msgEl.style.position = 'relative';
  messagesEl.appendChild(msgEl);
  messagesEl.scrollTop = messagesEl.scrollHeight;

  let fullReply = '';

  // Detect cold start — if no response chunk arrives within 3 seconds,
  // show a "waking up" message so the wait doesn't look broken
  let wakingUpTimeout = setTimeout(() => {
    msgEl.innerHTML = `<em style="opacity:0.6;">Waking up Sage's servers, just a moment... ⏳</em>`;
  }, 3000);

  try {
    const response = await fetch(BACKEND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        history: conversationHistory.slice(0, -1)
      })
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter(line => line.startsWith('data: '));

      for (const line of lines) {
        const dataStr = line.replace('data: ', '');
        if (dataStr === '[DONE]') continue;

        try {
         const data = JSON.parse(dataStr);
          if (data.content) {
            clearTimeout(wakingUpTimeout); // real content arrived, cancel the waking-up message
            fullReply += data.content;
            msgEl.innerHTML = formatMessage(fullReply);
            messagesEl.scrollTop = messagesEl.scrollHeight;
          }
          if (data.error) {
            msgEl.innerHTML = formatMessage(data.error);
          }
        } catch (e) {
          // ignore parse errors on incomplete chunks
        }
      }
    }

    // Add copy button now that streaming is done
    const copyBtn = document.createElement('button');
    copyBtn.className = 'copy-btn';
    copyBtn.innerHTML = '📋';
    copyBtn.title = 'Copy response';
    copyBtn.onclick = () => {
      navigator.clipboard.writeText(fullReply);
      copyBtn.innerHTML = '✓';
      setTimeout(() => { copyBtn.innerHTML = '📋'; }, 1500);
    };
    msgEl.appendChild(copyBtn);

    conversationHistory.push({ role: 'assistant', content: fullReply });

    const time = document.createElement('div');
    time.className = 'timestamp';
    time.textContent = getTime();
    messagesEl.appendChild(time);

  } catch (error) {
    console.error('Error talking to backend:', error);
    msgEl.textContent = "I'm having trouble connecting right now. Please try again shortly.";
  }
}

// ── EVENT: open chat ──
function openChat() {
  chatWindow.classList.remove('hidden');
  chatWindow.style.animation = 'none';
  chatWindow.offsetHeight; // force reflow so animation replays
  chatWindow.style.animation = 'bounce-in-right 1.1s both';

  unreadBadge.classList.add('hidden');

  // First time opening — show greeting + chips
  if (!chatOpened) {
    chatOpened = true;
    addMessage("Hey there 👋 I'm Sage, your guide to everything SALIX Data. What can I help you with?", 'bot');
    addChips();
  }
}

// ── EVENT: close chat ──
function closeChat() {
  chatWindow.style.animation = 'bounce-out-left 1.5s both';
  setTimeout(() => {
    chatWindow.classList.add('hidden');
  }, 1500);
}

// ── WIRE UP EVENTS ──
bubbleBtn.addEventListener('click', openChat);
closeBtn.addEventListener('click', closeChat);

sendBtn.addEventListener('click', () => {
  const text = chatInput.value;
  chatInput.value = '';
  sendMessage(text);
});

chatInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    const text = chatInput.value;
    chatInput.value = '';
    sendMessage(text);
  }
});
// ── LEAD CAPTURE ──
emailjs.init('cukLKBDGqgPywkKaR');

const quoteBtn = document.getElementById('quoteBtn');
const leadFormOverlay = document.getElementById('leadFormOverlay');
const leadFormClose = document.getElementById('leadFormClose');
const leadSubmit = document.getElementById('leadSubmit');
const leadName = document.getElementById('leadName');
const leadEmail = document.getElementById('leadEmail');
const leadMessage = document.getElementById('leadMessage');
const leadStatus = document.getElementById('leadStatus');

quoteBtn.addEventListener('click', () => {
  leadFormOverlay.classList.add('visible');
});

leadFormClose.addEventListener('click', () => {
  leadFormOverlay.classList.remove('visible');
  leadStatus.textContent = '';
  leadStatus.className = 'lead-status';
});

leadSubmit.addEventListener('click', () => {
  const name = leadName.value.trim();
  const email = leadEmail.value.trim();
  const message = leadMessage.value.trim();

  if (!name || !email || !message) {
    leadStatus.textContent = 'Please fill in all fields.';
    leadStatus.className = 'lead-status error';
    return;
  }

  leadSubmit.disabled = true;
  leadStatus.textContent = 'Sending...';
  leadStatus.className = 'lead-status';

  emailjs.send('service_ykifmb7', 'template_x3bi80t', {
  from_name: name,
  from_email: email,
  message: message
})
  .then(() => {
   leadStatus.textContent = 'Thanks! SALIX Data will be in touch soon 🎉';
    leadStatus.className = 'lead-status success';
    leadName.value = '';
    leadEmail.value = '';
    leadMessage.value = '';
    leadSubmit.disabled = false;

    setTimeout(() => {
      leadFormOverlay.classList.remove('visible');
      leadStatus.textContent = '';
      leadStatus.className = 'lead-status';
    }, 2500);
  })
  .catch((error) => {
    console.error('EmailJS error:', error);
    leadStatus.textContent = 'Something went wrong. Please try again.';
    leadStatus.className = 'lead-status error';
    leadSubmit.disabled = false;
  });
});
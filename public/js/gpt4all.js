// public/js/gpt4all.js
document.addEventListener('DOMContentLoaded', () => {
  // Inject root into support page if present, else into body
  const anchor = document.getElementById('gpt4all-root') || document.body;
  const wrapper = document.createElement('div');
  wrapper.id = 'gpt4all-widget';
  wrapper.innerHTML = `
    <button id="gpt-toggle" aria-label="Open chat">💬</button>
    <div id="gpt-panel" class="hidden" role="dialog" aria-hidden="true">
      <header>
        <strong>Support Chat</strong>
        <button id="gpt-close" aria-label="Close chat">✕</button>
      </header>
      <div id="gpt-messages" class="messages"></div>
      <form id="gpt-form" autocomplete="off">
        <input id="gpt-input" name="gpt" placeholder="Ask about orders, vendors or refunds..." />
        <button type="submit">Send</button>
      </form>
    </div>
  `;
  anchor.appendChild(wrapper);

  const toggle = document.getElementById('gpt-toggle');
  const panel = document.getElementById('gpt-panel');
  const closeBtn = document.getElementById('gpt-close');
  const messages = document.getElementById('gpt-messages');
  const form = document.getElementById('gpt-form');
  const input = document.getElementById('gpt-input');

  function show() {
    panel.classList.remove('hidden');
    panel.setAttribute('aria-hidden', 'false');
    input.focus();
  }
  function hide() {
    panel.classList.add('hidden');
    panel.setAttribute('aria-hidden', 'true');
  }

  toggle.addEventListener('click', show);
  closeBtn.addEventListener('click', hide);

  function appendMsg(text, who = 'bot') {
    const el = document.createElement('div');
    el.className = `msg ${who}`;
    // allow basic HTML from model? NO — escape to be safe
    el.textContent = text;
    messages.appendChild(el);
    messages.scrollTop = messages.scrollHeight;
  }

  async function sendToServer(text) {
    appendMsg(text, 'user');
    const loading = document.createElement('div');
    loading.className = 'msg bot loading';
    loading.textContent = '…';
    messages.appendChild(loading);
    messages.scrollTop = messages.scrollHeight;

    try {
      const res = await fetch('/api/gpt4all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      loading.remove();
      if (!res.ok || data.error) {
        appendMsg('Sorry, I could not get a reply.', 'bot');
        console.error('gpt4all client error', data.error || data);
        return;
      }
      appendMsg(String(data.reply || data), 'bot');
    } catch (err) {
      loading.remove();
      appendMsg('Network error — try again later.', 'bot');
      console.error(err);
    }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const txt = input.value.trim();
    if (!txt) return;
    input.value = '';
    sendToServer(txt);
  });

  appendMsg('Welcome! Ask about ordering, delivery, or vendor signup.', 'bot');
});

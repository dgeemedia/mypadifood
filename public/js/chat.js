// public/js/chat.js
// Socket-enabled chat client for MyPadiFood
// Supports two modes:
// 1) server-rendered page with window.ORDER_ID set (auto-join room immediately)
// 2) modal/open flow where openChat(orderId) is called

(function () {
  // ensure socket.io client present
  if (typeof io === 'undefined') {
    console.warn('socket.io client not loaded');
    return;
  }

  // Single socket instance for the page
  let socket = null;
  let currentOrderId = null;

  function ensureSocket() {
    if (socket) return socket;
    socket = io();

    socket.on('connect', () => {
      // console.log('socket connected', socket.id);
    });

    socket.on('new_message', msg => {
      if (!currentOrderId || !msg) return;
      const msgOrderId = msg.order_id || msg.orderId || msg.order;
      if (String(msgOrderId) === String(currentOrderId)) {
        appendMessage(msg);
      }
    });

    socket.on('error', err => {
      console.warn('socket error', err);
    });

    // other optional events
    socket.on('order_opened', payload => {
      // for admin pages; no-op here
      // console.debug('order_opened', payload);
    });

    return socket;
  }

  // If server injected ORDER_ID, auto-open that order (server-rendered page case)
  if (typeof window.ORDER_ID !== 'undefined' && window.ORDER_ID) {
    (async () => {
      const orderId = window.ORDER_ID;
      currentOrderId = orderId;
      ensureSocket();
      // immediately join the order room on socket side
      try {
        socket.emit('join_order', { orderId });
      } catch (e) {
        console.warn('join_order emit failed', e);
      }

      // load and render existing messages
      await loadMessagesFor(orderId);

      // if we have UI (chat modal or page), make sure it is visible
      const modal = document.getElementById('chatModal');
      if (modal) modal.style.display = 'block';

      // show/hide bot prompt if exists
      try {
        const msgs = await fetch(`/chat/order/${orderId}`).then(r => r.json());
        const bot = msgs.messages && msgs.messages.find(m => m.sender_type === 'bot');
        const botArea = document.getElementById('botPromptArea');
        if (botArea) botArea.style.display = bot ? 'block' : 'none';
      } catch (e) {
        // ignore
      }
    })();
  }

  // click handler for elements that open chat dynamically
  document.addEventListener('click', e => {
    if (e.target && e.target.matches('.btn-view-chat')) {
      const id = e.target.dataset.orderId;
      if (id) openChat(id);
    }
  });

  // public openChat used by modal flow
  async function openChat(orderId) {
    currentOrderId = orderId;
    const modal = document.getElementById('chatModal');
    if (modal) modal.style.display = 'block';

    const s = ensureSocket();
    if (!s) {
      await loadMessagesFor(orderId);
      return;
    }

    try {
      s.emit('join_order', { orderId });
      s.emit('open_chat', { orderId }); // fallback notification
    } catch (e) {
      console.warn('emit join_order/open_chat failed', e);
    }

    await loadMessagesFor(orderId);

    // show/hide bot prompt based on DB
    try {
      const msgs = await fetch(`/chat/order/${orderId}`).then(r => r.json());
      const bot = msgs.messages && msgs.messages.find(m => m.sender_type === 'bot');
      const botArea = document.getElementById('botPromptArea');
      if (botArea) botArea.style.display = bot ? 'block' : 'none';
    } catch (e) {
      // ignore
    }
  }

  async function loadMessagesFor(orderId) {
    if (!orderId) return;
    currentOrderId = orderId;
    try {
      const res = await fetch(`/chat/order/${orderId}`);
      const json = await res.json();
      const container = document.getElementById('chatMessages');
      if (!container) return;
      container.innerHTML = '';
      (json.messages || []).forEach(m => appendMessage(m));
      container.scrollTop = container.scrollHeight;
    } catch (e) {
      console.error('loadMessages error', e);
    }
  }

  function appendMessage(m) {
    const container = document.getElementById('chatMessages');
    if (!container) return;
    const el = document.createElement('div');
    const who = m.sender_type || m.senderType || 'unknown';
    const ts = m.created_at ? ` (${new Date(m.created_at).toLocaleTimeString()})` : '';
    el.innerText = `[${who}] ${m.message}${ts}`;
    container.appendChild(el);
    container.scrollTop = container.scrollHeight;
  }

  // send message via existing REST endpoint (server persists and emits)
  document.addEventListener('click', async e => {
    if (e.target && e.target.id === 'sendMsg') {
      const input = document.getElementById('chatInput');
      const text = input ? input.value.trim() : '';
      if (!text || !currentOrderId) return;
      try {
        await fetch('/chat/message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId: currentOrderId, message: text })
        });
        if (input) input.value = '';
        // server will emit 'new_message' and it will be appended
      } catch (err) {
        console.error('send message error', err);
      }
    }
  });

  // client modify / yes/no buttons (same behavior as before)
  document.addEventListener('click', async e => {
    if (!currentOrderId) return;

    if (e.target && e.target.id === 'botYes') {
      const area = document.getElementById('clientModifyArea');
      if (area) area.style.display = 'block';
    }

    if (e.target && e.target.id === 'clientModifySubmit') {
      const txtEl = document.getElementById('clientModifyText');
      const txt = txtEl ? txtEl.value.trim() : '';
      if (!txt) return;
      try {
        await fetch('/chat/message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId: currentOrderId, message: txt })
        });
        if (txtEl) txtEl.value = '';
        const area = document.getElementById('clientModifyArea');
        if (area) area.style.display = 'none';
        const botArea = document.getElementById('botPromptArea');
        if (botArea) botArea.style.display = 'none';
      } catch (err) {
        console.error('client modify submit error', err);
      }
    }

    if (e.target && e.target.id === 'botNo') {
      try {
        await fetch('/chat/message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId: currentOrderId, message: 'No modification needed.' })
        });
      } catch (err) {
        console.error('botNo error', err);
      }
    }

    if (e.target && e.target.id === 'closeChat') {
      if (socket && currentOrderId) {
        try { socket.emit('leave_order', { orderId: currentOrderId }); } catch (e) {}
      }
      const modal = document.getElementById('chatModal');
      if (modal) modal.style.display = 'none';
      currentOrderId = null;
    }
  });

  // expose helpers for testing
  window._mypadifood_chat = {
    openChat,
    loadMessagesFor,
    getSocket: ensureSocket
  };
})();

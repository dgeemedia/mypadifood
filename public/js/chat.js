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
    // include credentials so cookies (session) are sent during handshake
    socket = io({ withCredentials: true });

    socket.on('connect', () => {
      // console.log('socket connected', socket.id);
    });

    // Admin-level events (real-time order notifications)
    socket.on('new_order', (orderSummary) => {
      // admin clients will receive this if they've joined 'admins'
      try {
        handleIncomingOrder(orderSummary);
      } catch (e) { console.warn('new_order handler', e); }
    });

    socket.on('order_message', (payload) => {
      // payload: { orderId, message }
      try {
        // If admin page showing pending orders, update entry / flash
        showOrderMessageNotification(payload);
        // Also append to chat modal if it's open for that order
        const msgOrderId = payload && (payload.orderId || payload.order_id || (payload.message && payload.message.order_id));
        if (msgOrderId && String(msgOrderId) === String(currentOrderId)) {
          appendMessage(payload.message);
        }
      } catch (e) { console.warn('order_message handler', e); }
    });

    socket.on('new_message', msg => {
      if (!currentOrderId || !msg) return;
      const msgOrderId = msg.order_id || msg.orderId || msg.order;
      if (String(msgOrderId) === String(currentOrderId)) {
        appendMessage(msg);
      }
    });

    socket.on('joined_order', (payload) => {
      // optional debug or UI reaction
      // console.debug('joined_order', payload);
    });

    socket.on('order_opened', payload => {
      // admin pages may react to client presence (we handle it in handleIncomingOrder or similar)
      // console.debug('order_opened', payload);
    });

    socket.on('error', err => {
      console.warn('socket error', err);
    });

    return socket;
  }

  // --- Admin handlers / helpers ---
  function handleIncomingOrder(order) {
    // Only run on admin pages (element exists)
    const panel = document.getElementById('pendingOrders');
    if (!panel) return;
    // build a small card with details (client & vendor)
    const item = document.createElement('div');
    item.className = 'pending-order-item';
    item.style.border = '1px solid #dfe6ef';
    item.style.padding = '10px';
    item.style.marginBottom = '8px';
    // guard the field names (some emitters use camelCase or snake_case)
    const id = order.id || order.orderId || order.order_id || '—';
    const clientName = order.client_name || order.clientName || order.client || '—';
    const clientPhone = order.client_phone || order.clientPhone || '—';
    const clientAddress = order.client_address || order.clientAddress || order.client_address || '—';
    const vendorName = order.vendor_name || order.vendorName || '—';
    const vendorPhone = order.vendor_phone || order.vendorPhone || '—';
    const vendorAddress = order.vendor_address || order.vendorAddress || '—';
    const itemText = order.item || order.description || '—';
    const total = order.total_amount || order.total || 0;

    item.innerHTML = `
      <strong>Order:</strong> ${id} <br/>
      <strong>Client:</strong> ${clientName} (${clientPhone}) <br/>
      <strong>Client address:</strong> ${clientAddress} <br/>
      <strong>Vendor:</strong> ${vendorName} (${vendorPhone}) <br/>
      <strong>Vendor address:</strong> ${vendorAddress} <br/>
      <strong>Item:</strong> ${itemText} | ₦${total} <br/>
      <div style="margin-top:6px;">
        <a href="/admin/orders/${id}">Open</a>
        <button class="btn btn-assign" data-order-id="${id}" style="margin-left:8px;">Accept</button>
      </div>
    `;
    // prepend so newest are first
    panel.insertBefore(item, panel.firstChild);

    // ensure the panel wrapper is visible
    const panelWrap = document.getElementById('pendingOrdersPanel');
    if (panelWrap && panelWrap.style.display === 'none') panelWrap.style.display = 'block';
  }

  function showOrderMessageNotification(payload) {
    // simple console/info notification; replace with toast if desired
    console.info('Order message', payload);
    // if admin pending panel hidden, make it visible
    const panelWrap = document.getElementById('pendingOrdersPanel');
    if (panelWrap && panelWrap.style.display === 'none') panelWrap.style.display = 'block';
  }

  // If server injected ORDER_ID, auto-open that order (server-rendered page case)
  if (typeof window.ORDER_ID !== 'undefined' && window.ORDER_ID) {
    (async () => {
      const orderId = window.ORDER_ID;
      currentOrderId = orderId;
      // expose to window helpers
      window._mypadifood_chat = window._mypadifood_chat || {};
      window._mypadifood_chat.currentOrderId = currentOrderId;

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
    window._mypadifood_chat = window._mypadifood_chat || {};
    window._mypadifood_chat.currentOrderId = currentOrderId;

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
    // message text may be in m.message or m.msg depending on backend; guard it
    const text = m.message || m.msg || JSON.stringify(m);
    el.innerText = `[${who}] ${text}${ts}`;
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
    // allow actions when currentOrderId exists or when they are UI-level (no order context)
    if (e.target && e.target.id === 'botYes') {
      const area = document.getElementById('clientModifyArea');
      if (area) area.style.display = 'block';
    }

    if (e.target && e.target.id === 'clientModifySubmit') {
      const txtEl = document.getElementById('clientModifyText');
      const txt = txtEl ? txtEl.value.trim() : '';
      if (!txt || !currentOrderId) return;
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
      if (!currentOrderId) return;
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
      if (window._mypadifood_chat) window._mypadifood_chat.currentOrderId = null;
    }

    // admin accept button (client side fallback) — redirect to admin order page to accept
    if (e.target && e.target.matches('.btn-assign')) {
      const id = e.target.getAttribute('data-order-id');
      if (!id) return;
      window.location.href = `/admin/orders/${id}`;
    }
  });

  // expose helpers for testing & usage
  window._mypadifood_chat = window._mypadifood_chat || {};
  window._mypadifood_chat.openChat = openChat;
  window._mypadifood_chat.loadMessagesFor = loadMessagesFor;
  window._mypadifood_chat.getSocket = ensureSocket;
  window._mypadifood_chat.currentOrderId = currentOrderId;

  // On admin pages auto-join admins room and wire UI handlers
  document.addEventListener('DOMContentLoaded', () => {
    const panel = document.getElementById('pendingOrdersPanel');
    if (panel) {
      ensureSocket();
      try { socket.emit('admin_join'); } catch (e) { console.warn('admin_join emit failed', e); }
    }

    // Attach click handlers for .btn-view-chat if not already covered
    document.addEventListener('click', (e) => {
      if (e.target && e.target.matches('.btn-view-chat')) {
        const id = e.target.getAttribute('data-order-id') || e.target.dataset.orderId;
        if (id) {
          window._mypadifood_chat.openChat(id);
        }
      }
    });
  });
})();

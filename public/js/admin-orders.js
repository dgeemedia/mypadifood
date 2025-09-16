// public/js/admin-orders.js (improved: auto-join admins room, toggle panel, online markers)
(function () {
  if (typeof io === 'undefined') {
    console.warn('socket.io client not loaded');
    return;
  }

  const socket = io();

  // when connected tell server we are an admin page (server will still verify session)
  socket.on('connect', () => {
    try {
      // request join to admins room (server should verify session user is admin)
      socket.emit('join', { room: 'admins' });
    } catch (e) {
      console.warn('Could not emit join admins', e);
    }
  });

  // toggle pending orders panel
  const navPending = document.getElementById('nav-pending-orders');
  if (navPending) {
    navPending.addEventListener('click', e => {
      e.preventDefault();
      const panel = document.getElementById('pendingOrdersPanel');
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    });
  }

  // Helpers
  function ensureCard(orderId, data) {
    const container = document.getElementById('pendingOrders');
    if (!container) return null;
    let card = document.getElementById(`order-card-${orderId}`);
    if (!card) {
      card = document.createElement('div');
      card.id = `order-card-${orderId}`;
      card.className = 'order-card';
      card.style.border = '1px solid #ddd';
      card.style.padding = '8px';
      card.style.marginBottom = '8px';
      card.innerHTML = `
        <div class="order-meta"><strong>Order:</strong> ${orderId}</div>
        <div class="order-client"><strong>Client:</strong> ${data && (data.clientName || data.client_name) ? (data.clientName || data.client_name) : '—'}</div>
        <div class="order-item"><strong>Item:</strong> ${data && data.item ? data.item : '—'}</div>
        <div class="order-actions" style="margin-top:6px;">
          <button class="open-order" data-order-id="${orderId}">Open</button>
        </div>
      `;
      container.prepend(card);
    }
    return card;
  }

  // new order pushed from server
  socket.on('new_order', data => {
    try {
      ensureCard(data.id, data);
      // optional highlight
      const card = document.getElementById(`order-card-${data.id}`);
      if (card) card.style.background = '#f9f9ff';
    } catch (e) {
      console.error('new_order handler error', e);
    }
  });

  // order_message: append snippet to card (also used for "New message" notifications)
  socket.on('order_message', payload => {
    try {
      // payload might be { orderId, message } or { orderId: ..., message: ... }
      const orderId = payload.orderId || payload.order_id || payload.order;
      const message = payload.message || payload.msg || payload;

      if (!orderId) {
        console.warn('order_message missing orderId', payload);
        return;
      }

      const card = ensureCard(orderId, {});
      if (!card) return;
      const note = document.createElement('div');
      note.className = 'order-msg-snippet';
      const who = (message && (message.sender_type || message.senderType)) ? (message.sender_type || message.senderType) : 'unknown';
      const txt = (message && message.message && message.message.length > 120) ? message.message.slice(0, 120) + '…' : (message && message.message ? message.message : '');
      note.innerText = `[${who}] ${txt}`;
      card.appendChild(note);

      // visual notification for new message
      card.style.border = '2px solid #2b8aef';

      // If you want the card to jump to top on new message:
      const container = document.getElementById('pendingOrders');
      if (container && card.parentNode === container) {
        container.prepend(card);
      }
    } catch (e) {
      console.error('order_message handler error', e);
    }
  });

  // order_opened: client opened chat for this order -> mark card as online, show client name
  socket.on('order_opened', ({ orderId, clientId, clientName }) => {
    try {
      const card = ensureCard(orderId, { clientName });
      if (!card) return;
      // add (or update) online indicator
      let onlineEl = card.querySelector('.online-indicator');
      if (!onlineEl) {
        onlineEl = document.createElement('span');
        onlineEl.className = 'online-indicator';
        onlineEl.style.color = '#fff';
        onlineEl.style.background = '#28a745';
        onlineEl.style.padding = '2px 6px';
        onlineEl.style.marginLeft = '8px';
        onlineEl.style.borderRadius = '4px';
        onlineEl.innerText = 'Client online';
        const meta = card.querySelector('.order-meta');
        if (meta) meta.appendChild(onlineEl);
      } else {
        onlineEl.innerText = 'Client online';
      }
      card.style.border = '2px solid #2b8aef';
    } catch (e) {
      console.error('order_opened handler error', e);
    }
  });

  // order_closed: client left the chat → remove online indicator
  socket.on('order_closed', ({ orderId }) => {
    try {
      const card = document.getElementById(`order-card-${orderId}`);
      if (!card) return;
      const onlineEl = card.querySelector('.online-indicator');
      if (onlineEl) onlineEl.remove();
      card.style.border = '1px solid #ddd';
    } catch (e) {
      console.error('order_closed handler error', e);
    }
  });

  // Open order click
  document.addEventListener('click', e => {
    if (e.target.matches('.open-order')) {
      const id = e.target.dataset.orderId;
      if (!id) return;
      window.location.href = `/admin/orders/${id}`;
    }
  });

  // expose for debugging if needed
  window._mypadifood_adminOrdersSocket = socket;
})();

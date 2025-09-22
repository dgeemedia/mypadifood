// public/js/admin-orders.js
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
      socket.emit('admin_join');
    } catch (e) {
      console.warn('Could not emit admin_join', e);
    }
  });

  // Toggle pending orders panel
  const navPending = document.getElementById('nav-pending-orders');
  if (navPending) {
    navPending.addEventListener('click', e => {
      e.preventDefault();
      const panel = document.getElementById('pendingOrdersPanel');
      if (!panel) return;
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    });
  }

  // --- Notification helpers ---
  function renderNotification(n) {
    const payloadSummary =
      (n && n.payload && n.payload.order_summary) ||
      (n && n.payload && (n.payload.item || n.payload.client_address)) ||
      JSON.stringify(n && n.payload ? n.payload : {});
    return `<div class="admin-notif" data-id="${escapeHtml(n.id)}">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div><strong>${escapeHtml(n.type || '')}</strong> — ${escapeHtml((n.payload && (n.payload.client_name || n.payload.clientName)) || '')}</div>
        <button class="mark-read" data-id="${escapeHtml(n.id)}" style="margin-left:10px;">Mark read</button>
      </div>
      <div style="font-size:0.9em;color:#666;margin-top:4px;">${escapeHtml(payloadSummary)}</div>
    </div>`;
  }

  function updateNotifBadge(n) {
    const el = document.getElementById('notifBadge');
    if (el) el.textContent = n > 0 ? n : '';
  }

  function incrementNotifBadge() {
    const el = document.getElementById('notifBadge');
    if (!el) return;
    const cur = parseInt(el.textContent || '0', 10) || 0;
    el.textContent = cur + 1;
  }

  // --- Orders UI helpers ---
  function renderOrderRow(o) {
    const onlineClass = o && o.client_online ? 'online' : '';
    const clientName = (o && (o.client_name || o.clientName)) ? (o.client_name || o.clientName) : '—';
    const vendorName = (o && (o.vendor_name || o.vendorName)) ? (o.vendor_name || o.vendorName) : '—';
    return `<div id="order-card-${escapeHtml(o.id)}" class="order-card ${onlineClass}" data-order-id="${escapeHtml(o.id)}" style="border:1px solid #ddd;padding:8px;margin-bottom:8px;">
      <div class="order-meta"><strong>Order:</strong> ${escapeHtml(o.id)} <span class="order-client-name" style="margin-left:8px;color:#333">${escapeHtml(clientName)}</span></div>
      <div class="order-vendor"><strong>Vendor:</strong> ${escapeHtml(vendorName)}</div>
      <div class="order-item"><strong>Item:</strong> ${escapeHtml(o.item || '[none]')}</div>
      <div class="order-actions" style="margin-top:6px;">
        <button class="open-order" data-order-id="${escapeHtml(o.id)}">Open</button>
      </div>
    </div>`;
  }

  function ensureCard(orderId, data = {}) {
    const container = document.getElementById('pendingOrders');
    if (!container) return null;
    let card = document.getElementById(`order-card-${orderId}`);
    if (!card) {
      const html = renderOrderRow(Object.assign({ id: orderId }, data));
      container.insertAdjacentHTML('afterbegin', html);
      card = document.getElementById(`order-card-${orderId}`);
    } else {
      // update some fields if provided
      const nameEl = card.querySelector('.order-client-name');
      const clientName = data.clientName || data.client_name;
      if (nameEl && clientName) nameEl.textContent = clientName;
      const itemEl = card.querySelector('.order-item');
      if (itemEl && data.item) itemEl.innerHTML = `<strong>Item:</strong> ${escapeHtml(data.item)}`;
    }
    return card;
  }

  // --- Notifications / initial state from server ---
  socket.on('initial_admin_state', payload => {
    try {
      const { orders = [], notifications = [] } = payload || {};
      const ordersContainer = document.getElementById('pendingOrders');
      const notifPanel = document.getElementById('notificationsPanel');

      if (ordersContainer) {
        // render each as a card
        ordersContainer.innerHTML = orders.map(o => renderOrderRow(o)).join('');
      }

      if (notifPanel) {
        notifPanel.innerHTML = notifications.map(n => renderNotification(n)).join('');
        updateNotifBadge(notifications.length);
      }
    } catch (e) {
      console.error('initial_admin_state handler error', e);
    }
  });

  // new order pushed from server
  socket.on('new_order', data => {
    try {
      if (!data || !data.id) return;
      // create or update card
      ensureCard(data.id, data);
      // highlight briefly
      const card = document.getElementById(`order-card-${data.id}`);
      if (card) {
        card.style.background = '#f9f9ff';
        setTimeout(() => { card.style.background = ''; }, 2000);
      }
      notifyTray('New order', `${data.client_name || data.clientName || 'Client'} — ${data.vendor_name || ''}`);
    } catch (e) {
      console.error('new_order handler error', e);
    }
  });

  // new persistent notification pushed from server
  socket.on('new_notification', notif => {
    try {
      const notifPanel = document.getElementById('notificationsPanel');
      if (notifPanel) {
        notifPanel.insertAdjacentHTML('afterbegin', renderNotification(notif));
      }
      incrementNotifBadge();
      notifyTray('New notification', notif && notif.type ? notif.type : 'Notification');
    } catch (e) {
      console.error('new_notification handler error', e);
    }
  });

  // order_message: append snippet to card (supports several payload shapes)
  socket.on('order_message', payload => {
    try {
      // payload might be { orderId, message } or { orderId: ..., message: ... } or { orderId, msg }
      const orderId = payload && (payload.orderId || payload.order_id || payload.order);
      const message = payload && (payload.message || payload.msg || payload);

      if (!orderId) {
        console.warn('order_message missing orderId', payload);
        return;
      }

      const card = ensureCard(orderId, {});
      if (!card) return;
      const note = document.createElement('div');
      note.className = 'order-msg-snippet';
      const who = (message && (message.sender_type || message.senderType)) ? (message.sender_type || message.senderType) : 'system';
      const txtRaw = (message && message.message) ? message.message : (typeof message === 'string' ? message : JSON.stringify(message || ''));
      const txt = txtRaw.length > 120 ? txtRaw.slice(0, 120) + '…' : txtRaw;
      note.innerText = `[${who}] ${txt}`;
      note.style.fontSize = '0.9em';
      note.style.color = '#444';
      note.style.marginTop = '6px';
      card.appendChild(note);

      // visual notification border
      card.style.border = '2px solid #2b8aef';

      // move to top
      const container = document.getElementById('pendingOrders');
      if (container && card.parentNode === container) container.prepend(card);
    } catch (e) {
      console.error('order_message handler error', e);
    }
  });

  // order_opened: client opened chat for this order -> mark card as online, show client name
  socket.on('order_opened', ({ orderId, clientId, clientName, clientPhone }) => {
    try {
      const card = ensureCard(orderId, { clientName });
      if (!card) return;
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

  // --- Notifications mark-read (delegated) and open-order click ---
  document.addEventListener('click', async (ev) => {
    const btn = ev.target;

    // mark read button
    if (btn.classList.contains('mark-read')) {
      const id = btn.dataset.id;
      if (!id) return;
      try {
        const resp = await fetch(`/admin/notifications/${encodeURIComponent(id)}/read`, { method: 'POST' });
        if (resp.ok) {
          const wrapper = btn.closest('.admin-notif');
          if (wrapper) wrapper.remove();
          const badge = document.getElementById('notifBadge');
          if (badge) {
            const current = parseInt(badge.textContent || '0', 10) || 0;
            badge.textContent = (current - 1) > 0 ? (current - 1) : '';
          }
        } else {
          console.error('Mark read request failed', resp.status);
        }
      } catch (e) {
        console.error('Mark read failed', e);
      }
      return;
    }

    // open order button
    if (btn.matches('.open-order')) {
      const id = btn.dataset.orderId;
      if (!id) return;
      window.location.href = `/admin/orders/${id}`;
      return;
    }
  });

  // tiny desktop notification helper
  function notifyTray(title, body) {
    if (window.Notification && Notification.permission === 'granted') {
      new Notification(title, { body });
    } else if (window.Notification && Notification.permission !== 'denied') {
      Notification.requestPermission().then(p => p === 'granted' && new Notification(title, { body }));
    }
  }

  // Escape HTML for inserted strings
  function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // expose for debugging if needed
  window._mypadifood_adminOrdersSocket = socket;
})();

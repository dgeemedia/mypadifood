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
      } catch (e) {
        console.warn('new_order handler', e);
      }
    });

    socket.on('order_message', (payload) => {
      // payload: { orderId, message }
      try {
        // If admin page showing pending orders, update entry / flash
        showOrderMessageNotification(payload);
        // Also append to chat modal if it's open for that order
        const msgOrderId =
          payload &&
          (payload.orderId ||
            payload.order_id ||
            (payload.message && payload.message.order_id));
        if (msgOrderId && String(msgOrderId) === String(currentOrderId)) {
          appendMessage(payload.message);
        }
      } catch (e) {
        console.warn('order_message handler', e);
      }
    });

    socket.on('new_message', (msg) => {
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

    socket.on('order_opened', (payload) => {
      // admin pages may react to client presence (we handle it in handleIncomingOrder or similar)
      // console.debug('order_opened', payload);
    });

    socket.on('error', (err) => {
      console.warn('socket error', err);
    });

    // NEW: live admin dashboard updates
    socket.on('order_updated', (payload) => {
      // update the order entry UI if present
      try {
        const id = payload.orderId || payload.order_id;
        if (!id) return;
        const el = document.getElementById(`order-${id}`);
        if (el) {
          // update status label if present (first small element near id)
          const small = el.querySelector('small');
          if (small) small.textContent = `(${payload.status || 'updated'})`;

          // optionally add assigned admin display
          if (payload.assigned_admin_name || payload.assigned_admin) {
            let assignedDiv = el.querySelector('.assigned-admin-display');
            if (!assignedDiv) {
              assignedDiv = document.createElement('div');
              assignedDiv.className = 'assigned-admin-display';
              assignedDiv.style.marginTop = '6px';
              assignedDiv.style.fontSize = '0.9em';
              assignedDiv.style.color = '#444';
              el.appendChild(assignedDiv);
            }
            assignedDiv.textContent = `Assigned: ${payload.assigned_admin_name || payload.assigned_admin}`;
          }

          // If status is accepted, expose a "Mark Done" button if desired (best-effort UI)
          if (payload.status === 'accepted') {
            // remove existing accept button if present, add "Mark Done"
            const acceptForm = el.querySelector(
              `form[action="/admin/orders/${id}/accept"]`
            );
            if (acceptForm) acceptForm.style.display = 'none';

            let doneForm = el.querySelector(
              `form[action="/admin/orders/${id}/done"]`
            );
            if (!doneForm) {
              doneForm = document.createElement('form');
              doneForm.method = 'post';
              doneForm.action = `/admin/orders/${id}/done`;
              doneForm.style.display = 'inline';
              doneForm.style.marginLeft = '8px';
              const btn = document.createElement('button');
              btn.type = 'submit';
              btn.className = 'btn';
              btn.textContent = 'Mark Done';
              doneForm.appendChild(btn);
              const actionsDiv = el.querySelector('div') || el;
              actionsDiv.appendChild(doneForm);
            } else {
              doneForm.style.display = 'inline';
            }
          }
        }
      } catch (e) {
        console.warn('order_updated handler', e);
      }
    });

    socket.on('order_completed', (payload) => {
      try {
        const id = payload.orderId || payload.order_id;
        if (!id) return;
        const el = document.getElementById(`order-${id}`);
        if (el) {
          el.style.background = '#f3f3f3';
          // hide buttons inside the element (forms/buttons)
          Array.from(el.querySelectorAll('button, form')).forEach(
            (n) => (n.style.display = 'none')
          );
          // mark completed label
          let badge = el.querySelector('.completed-badge');
          if (!badge) {
            badge = document.createElement('span');
            badge.className = 'completed-badge';
            badge.style.marginLeft = '8px';
            badge.style.color = '#666';
            badge.textContent = 'Completed';
            el.appendChild(badge);
          }
        }
      } catch (e) {
        console.warn('order_completed handler', e);
      }
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
    const clientName =
      order.client_name || order.clientName || order.client || '—';
    const clientPhone = order.client_phone || order.clientPhone || '—';
    const clientAddress =
      order.client_address ||
      order.clientAddress ||
      order.client_address ||
      '—';
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
    if (panelWrap && panelWrap.style.display === 'none')
      panelWrap.style.display = 'block';
  }

  function showOrderMessageNotification(payload) {
    // simple console/info notification; replace with toast if desired
    console.info('Order message', payload);
    // if admin pending panel hidden, make it visible
    const panelWrap = document.getElementById('pendingOrdersPanel');
    if (panelWrap && panelWrap.style.display === 'none')
      panelWrap.style.display = 'block';
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
        const msgs = await fetch(`/chat/order/${orderId}`).then((r) =>
          r.json()
        );
        const bot =
          msgs.messages && msgs.messages.find((m) => m.sender_type === 'bot');
        const botArea = document.getElementById('botPromptArea');
        if (botArea) botArea.style.display = bot ? 'block' : 'none';
      } catch (e) {
        // ignore
      }
    })();
  }

  // click handler for elements that open chat dynamically
  document.addEventListener('click', (e) => {
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
      const msgs = await fetch(`/chat/order/${orderId}`).then((r) => r.json());
      const bot =
        msgs.messages && msgs.messages.find((m) => m.sender_type === 'bot');
      const botArea = document.getElementById('botPromptArea');
      if (botArea) botArea.style.display = bot ? 'block' : 'none';
    } catch (e) {
      // ignore
    }
  }

  // ===== REPLACED loadMessagesFor (improved bot prompt detection) =====
  async function loadMessagesFor(orderId) {
    if (!orderId) return;
    currentOrderId = orderId;
    try {
      const res = await fetch(`/chat/order/${orderId}`);
      const json = await res.json();
      const container = document.getElementById('chatMessages');
      if (!container) return;
      container.innerHTML = '';

      // ensure messages come in chronological order
      (json.messages || []).forEach((m) => appendMessage(m));
      container.scrollTop = container.scrollHeight;

      // set modal title / order id display
      const titleEl = document.getElementById('chatTitle');
      const orderEl = document.getElementById('chatOrderId');
      if (titleEl) titleEl.textContent = 'Chat';
      if (orderEl) orderEl.textContent = `Order #${orderId}`;

      // show bot prompt area only if there is an *active bot prompt* (heuristic)
      // We look for bot messages that look like a yes/no prompt (contains "would you like", "select yes or no", "modify this request", etc.)
      const botArea = document.getElementById('botPromptArea');
      const isBotPrompt = (json.messages || []).some((x) => {
        if (!x) return false;
        const t = (x.message || '').toString().toLowerCase();
        return (
          (x.sender_type === 'bot' ||
            (x.senderType || '').toLowerCase() === 'bot') &&
          (t.includes('would you like') ||
            t.includes('select yes or no') ||
            t.includes('modify this request') ||
            t.includes('would you like to modify'))
        );
      });

      if (botArea) botArea.style.display = isBotPrompt ? 'block' : 'none';

      // ensure header Yes/No (if present) follow same visibility (hide them for clarity)
      const headerYes = document.getElementById('botYes');
      const headerNo = document.getElementById('botNo');
      if (headerYes)
        headerYes.style.display = isBotPrompt ? 'inline-block' : 'none';
      if (headerNo)
        headerNo.style.display = isBotPrompt ? 'inline-block' : 'none';
    } catch (e) {
      console.error('loadMessages error', e);
    }
  }

  // ===== REPLACED appendMessage (chat-style rendering) =====
  function appendMessage(m) {
    const container = document.getElementById('chatMessages');
    if (!container || !m) return;

    // Defensive normalisation
    const senderType =
      ((m.sender_type || m.senderType || '') + '').toLowerCase() || 'bot';
    const displayName =
      m.display_name ||
      m.displayName ||
      (senderType === 'client' ? m.client_name || 'You' : null) ||
      (senderType === 'admin' ? m.admin_name || 'Admin' : null) ||
      (senderType === 'bot' ? 'Support' : m.sender_type || 'User');

    const text = (m.message || m.msg || '') + '';
    const ts = m.created_at
      ? new Date(m.created_at)
      : m.createdAt
        ? new Date(m.createdAt)
        : null;

    // build elements
    const wrapper = document.createElement('div');
    wrapper.className =
      'msg ' +
      (senderType === 'client'
        ? 'client'
        : senderType === 'admin'
          ? 'admin'
          : 'bot');

    const header = document.createElement('div');
    header.className = 'msg-header';

    const nameEl = document.createElement('div');
    nameEl.className = 'msg-sender';
    nameEl.textContent = displayName;

    const timeEl = document.createElement('div');
    timeEl.className = 'msg-time';
    timeEl.textContent = ts ? ts.toLocaleString() : '';

    header.appendChild(nameEl);
    header.appendChild(timeEl);

    const body = document.createElement('div');
    body.className = 'msg-body';
    // preserve newlines but keep it safe from HTML injection
    body.textContent = text;

    wrapper.appendChild(header);
    wrapper.appendChild(body);

    // append and scroll
    container.appendChild(wrapper);
    container.scrollTop = container.scrollHeight;
  }

  // send message via existing REST endpoint (server persists and emits)
  document.addEventListener('click', async (e) => {
    if (e.target && e.target.id === 'sendMsg') {
      const input = document.getElementById('chatInput');
      const text = input ? input.value.trim() : '';
      if (!text || !currentOrderId) return;
      try {
        await fetch('/chat/message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId: currentOrderId, message: text }),
        });
        if (input) input.value = '';
        // server will emit 'new_message' and it will be appended
      } catch (err) {
        console.error('send message error', err);
      }
    }
  });

  // ===== REPLACED bot Yes/No/Modify click handlers =====
  document.addEventListener('click', async (e) => {
    // YES: reveal modification textarea
    if (
      e.target &&
      (e.target.id === 'botYes' || e.target.dataset.action === 'bot-yes')
    ) {
      const area = document.getElementById('clientModifyArea');
      if (area) area.style.display = 'block';
      const ta = document.getElementById('clientModifyText');
      if (ta) ta.focus();
      return;
    }

    // SUBMIT modification: send message, hide bot prompt and textarea
    if (e.target && e.target.id === 'clientModifySubmit') {
      const txtEl = document.getElementById('clientModifyText');
      const txt = txtEl ? txtEl.value.trim() : '';
      if (!txt || !currentOrderId) return;
      try {
        e.target.disabled = true;
        e.target.textContent = 'Sending…';
        await fetch('/chat/message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId: currentOrderId, message: txt }),
        });
        // hide and reset UI
        if (txtEl) txtEl.value = '';
        const area = document.getElementById('clientModifyArea');
        if (area) area.style.display = 'none';
        const botArea = document.getElementById('botPromptArea');
        if (botArea) botArea.style.display = 'none';
        const headerYes = document.getElementById('botYes');
        const headerNo = document.getElementById('botNo');
        if (headerYes) headerYes.style.display = 'none';
        if (headerNo) headerNo.style.display = 'none';
      } catch (err) {
        console.error('client modify submit error', err);
        alert('Failed to send modification. Please try again.');
      } finally {
        e.target.disabled = false;
        e.target.textContent = 'Send modification';
      }
      return;
    }

    // NO: send short 'no' response and hide prompt immediately
    if (
      e.target &&
      (e.target.id === 'botNo' || e.target.dataset.action === 'bot-no')
    ) {
      if (!currentOrderId) return;
      try {
        const headerYes = document.getElementById('botYes');
        const headerNo = document.getElementById('botNo');

        [headerYes, headerNo].forEach((el) => {
          if (el) {
            el.disabled = true;
            el.textContent = 'Sending…';
          }
        });

        await fetch('/chat/message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderId: currentOrderId,
            message: 'No modification needed.',
          }),
        });

        // hide the bot prompt UI so it doesn't "stick out"
        const botArea = document.getElementById('botPromptArea');
        if (botArea) botArea.style.display = 'none';

        // also hide header inline buttons
        if (headerYes) headerYes.style.display = 'none';
        if (headerNo) headerNo.style.display = 'none';

        // Optional: show a tiny ephemeral confirmation in chat (client-side only)
        const container = document.getElementById('chatMessages');
        if (container) {
          const temp = document.createElement('div');
          temp.className = 'msg bot';
          temp.style.opacity = '0.9';
          temp.style.fontStyle = 'italic';
          temp.textContent =
            'Thanks — your response was recorded. An agent will contact you if needed.';
          container.appendChild(temp);
          container.scrollTop = container.scrollHeight;
          // remove temp after a short while (server will likely emit a real bot message too)
          setTimeout(() => {
            try {
              temp.remove();
            } catch (e) {}
          }, 5000);
        }
      } catch (err) {
        console.error('botNo error', err);
        alert('Could not send your response. Please try again.');
      } finally {
        // re-enable buttons text if any remained
        [
          document.getElementById('botYes'),
          document.getElementById('botNo'),
        ].forEach((el) => {
          if (el) {
            el.disabled = false;
            el.textContent = el.id === 'botYes' ? 'Yes' : 'No';
          }
        });
      }
      return;
    }

    // close chat
    if (e.target && e.target.id === 'closeChat') {
      if (socket && currentOrderId) {
        try {
          socket.emit('leave_order', { orderId: currentOrderId });
        } catch (e) {}
      }
      const modal = document.getElementById('chatModal');
      if (modal) modal.style.display = 'none';
      currentOrderId = null;
      if (window._mypadifood_chat)
        window._mypadifood_chat.currentOrderId = null;
      return;
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
      try {
        socket.emit('admin_join');
      } catch (e) {
        console.warn('admin_join emit failed', e);
      }
    }

    // Attach click handlers for .btn-view-chat if not already covered
    document.addEventListener('click', (e) => {
      if (e.target && e.target.matches('.btn-view-chat')) {
        const id =
          e.target.getAttribute('data-order-id') || e.target.dataset.orderId;
        if (id) {
          window._mypadifood_chat.openChat(id);
        }
      }
    });
  });
})();

/* Draggable chat: pointer-based dragging + persistence
   This runs in a separate IIFE so it can be pasted at the bottom of the file.
*/
(function enableChatDrag() {
  const modal = document.getElementById('chatModal');
  const handle = document.getElementById('chatDragHandle');
  if (!modal || !handle) return;

  // localStorage key
  const POS_KEY = 'mypadifood_chat_modal_pos_v1';

  // apply saved position if present
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (raw) {
      const pos = JSON.parse(raw);
      if (pos && typeof pos.left === 'number' && typeof pos.top === 'number') {
        // apply left/top and remove right/bottom to avoid CSS conflicts
        modal.style.left =
          Math.max(
            8,
            Math.min(window.innerWidth - (modal.offsetWidth + 8), pos.left)
          ) + 'px';
        modal.style.top =
          Math.max(
            8,
            Math.min(window.innerHeight - (modal.offsetHeight + 8), pos.top)
          ) + 'px';
        modal.style.right = 'auto';
        modal.style.bottom = 'auto';
      }
    }
  } catch (e) {
    console.warn('Could not restore chat position', e);
  }

  // helper to clamp coordinates inside viewport with small margin
  function clamp(x, min, max) {
    return Math.min(max, Math.max(min, x));
  }

  let dragging = false;
  let pointerId = null;
  let startX = 0,
    startY = 0;
  let startLeft = 0,
    startTop = 0;

  handle.style.touchAction = 'none'; // prevent gestures interfering on the handle
  handle.style.cursor = 'grab';

  function onPointerDown(ev) {
    // only start drag for primary pointer
    if (dragging) return;
    // if target is a button inside the header, bail out
    if (
      ev.target.closest('button') ||
      ev.target.nodeName === 'BUTTON' ||
      ev.target.getAttribute('role') === 'button'
    ) {
      return;
    }

    pointerId = ev.pointerId;
    dragging = true;
    modal.classList.add('dragging');
    handle.style.cursor = 'grabbing';

    // ensure modal has left/top anchored
    const rect = modal.getBoundingClientRect();
    // if currently using right/bottom, compute left/top from rect
    if (!modal.style.left) {
      modal.style.left = rect.left + 'px';
    }
    if (!modal.style.top) {
      modal.style.top = rect.top + 'px';
    }
    // lock right/bottom so left/top take effect
    modal.style.right = 'auto';
    modal.style.bottom = 'auto';

    // store start offsets
    startX = ev.clientX;
    startY = ev.clientY;
    startLeft = parseFloat(modal.style.left || rect.left);
    startTop = parseFloat(modal.style.top || rect.top);

    // capture pointer so we get pointermove outside the handle too
    try {
      handle.setPointerCapture(pointerId);
    } catch (e) {}

    // attach listeners
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', onPointerUp);

    ev.preventDefault();
  }

  function onPointerMove(ev) {
    if (!dragging || ev.pointerId !== pointerId) return;
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;
    let newLeft = startLeft + dx;
    let newTop = startTop + dy;

    // clamp within viewport with 8px margin
    const margin = 8;
    const maxLeft = window.innerWidth - modal.offsetWidth - margin;
    const maxTop = window.innerHeight - modal.offsetHeight - margin;
    newLeft = clamp(newLeft, margin, Math.max(margin, maxLeft));
    newTop = clamp(newTop, margin, Math.max(margin, maxTop));

    modal.style.left = Math.round(newLeft) + 'px';
    modal.style.top = Math.round(newTop) + 'px';
    ev.preventDefault();
  }

  function onPointerUp(ev) {
    if (!dragging || ev.pointerId !== pointerId) return;
    dragging = false;
    modal.classList.remove('dragging');
    handle.style.cursor = 'grab';
    try {
      handle.releasePointerCapture(pointerId);
    } catch (e) {}

    // save position
    try {
      const left = parseFloat(
        modal.style.left || modal.getBoundingClientRect().left
      );
      const top = parseFloat(
        modal.style.top || modal.getBoundingClientRect().top
      );
      localStorage.setItem(POS_KEY, JSON.stringify({ left, top }));
    } catch (e) {
      console.warn('Could not save chat position', e);
    }

    // remove listeners
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
    document.removeEventListener('pointercancel', onPointerUp);

    ev.preventDefault();
  }

  // double-click handle to reset position to bottom-right
  handle.addEventListener('dblclick', (ev) => {
    ev.preventDefault();
    modal.style.left = 'auto';
    modal.style.top = 'auto';
    modal.style.right = '1rem';
    modal.style.bottom = '1rem';
    try {
      localStorage.removeItem(POS_KEY);
    } catch (e) {}
  });

  // pointerdown to begin drag
  handle.addEventListener('pointerdown', onPointerDown);

  // When window resizes, keep chat inside viewport (adjust if necessary)
  window.addEventListener('resize', () => {
    try {
      const rect = modal.getBoundingClientRect();
      const margin = 8;
      let left = rect.left;
      let top = rect.top;
      const maxLeft = window.innerWidth - modal.offsetWidth - margin;
      const maxTop = window.innerHeight - modal.offsetHeight - margin;
      left = clamp(left, margin, Math.max(margin, maxLeft));
      top = clamp(top, margin, Math.max(margin, maxTop));
      modal.style.left = left + 'px';
      modal.style.top = top + 'px';
    } catch (e) {}
  });
})();

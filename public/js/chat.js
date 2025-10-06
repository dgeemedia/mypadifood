//public/js/chat.js
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
      try {
        handleIncomingOrder(orderSummary);
      } catch (e) {
        console.warn('new_order handler', e);
      }
    });

    socket.on('order_message', (payload) => {
      try {
        showOrderMessageNotification(payload);
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

    // Weekly-plan messages (clients & admins)
    // Improved handler: prefers server-provided display_name, falls back to sensible names,
    // escapes HTML, appends to container and bumps notif badge.
    socket.on('weekly_plan_message', (msg) => {
      try {
        const messagesContainer = document.getElementById('weeklyPlanMessages');

        // Determine current plan id on page (if any)
        const currentPlanIdEl = document.getElementById('currentWeeklyPlanId');
        const curPlanId = currentPlanIdEl
          ? String(currentPlanIdEl.value)
          : null;
        const mPlanId = String(
          msg.weekly_plan_order_id ||
            msg.weekly_plan_id ||
            msg.weekly_plan ||
            msg.planId ||
            ''
        );

        // If this page shows a particular plan, only append messages for that plan
        if (!curPlanId || curPlanId === mPlanId) {
          if (messagesContainer && msg) {
            // Compose display name with fallbacks:
            // 1) msg.display_name (server-provided)
            // 2) msg.sender_name / msg.senderName
            // 3) msg.client_name / msg.clientName (if client)
            // 4) msg.assigned_admin_name (if admin)
            // 5) fallback to 'Customer' / 'Food Specialist' / sender_type / 'Support'
            const rawDisplay =
              msg.display_name ||
              msg.displayName ||
              msg.sender_name ||
              msg.senderName ||
              msg.client_name ||
              msg.clientName ||
              (msg.sender_type === 'client' ? null : null) ||
              msg.assigned_admin_name ||
              msg.assignedAdminName ||
              null;

            let displayName = rawDisplay;
            if (!displayName) {
              const st = (
                msg.sender_type ||
                msg.senderType ||
                ''
              ).toLowerCase();
              if (st === 'client') displayName = msg.client_name || 'Customer';
              else if (st === 'admin')
                displayName =
                  msg.assigned_admin_name ||
                  msg.admin_name ||
                  'Food Specialist';
              else displayName = msg.sender_type || msg.senderType || 'Support';
            }

            const nameEsc = escapeHtml(String(displayName || 'Support'));
            const textEsc = escapeHtml(String(msg.message || msg.msg || ''));
            const tsRaw =
              msg.created_at || msg.createdAt || new Date().toISOString();
            const timeStr = escapeHtml(new Date(tsRaw).toLocaleString());

            const div = document.createElement('div');
            div.className = 'weekly-plan-msg';
            div.innerHTML = `<strong>${nameEsc}</strong>: ${textEsc} <div style="font-size:0.8em;color:#666">${timeStr}</div>`;
            messagesContainer.appendChild(div);
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
          }
        }

        // increment notification badge globally
        const badge = document.getElementById('notifBadge');
        if (badge) {
          const current = parseInt(badge.textContent || '0', 10) || 0;
          badge.textContent = String(current + 1);
        }
      } catch (e) {
        console.warn('weekly_plan_message handler', e);
      }
    });

    // Receive new weekly plans (admins)
    socket.on('new_weekly_plan', (payload) => {
      try {
        const badge = document.getElementById('notifBadge');
        if (badge) {
          const current = parseInt(badge.textContent || '0', 10) || 0;
          badge.textContent = String(current + 1);
        }

        // If admin page has a pending weekly plans area, show it
        const pendingPanel = document.getElementById('pendingWeeklyPlansPanel');
        const pendingList = document.getElementById('pendingWeeklyPlans');
        if (pendingList) {
          const el = document.createElement('div');
          el.className = 'pending-weekly-plan';
          el.style.border = '1px solid #cfeffd';
          el.style.padding = '8px';
          el.style.marginBottom = '8px';

          const clientName = payload.client_name || 'Client';
          const clientPhone = payload.client_phone
            ? ` (${payload.client_phone})`
            : '';
          const clientAddress = payload.client_address
            ? ` — ${payload.client_address}`
            : '';

          el.innerHTML = `<strong>Weekly plan</strong> — ${escapeHtml(clientName)}${escapeHtml(clientPhone)} — Week: ${escapeHtml(payload.week_of || '')} — ₦${escapeHtml(String(payload.total_price || payload.total || ''))} <a href="/admin/food-orders/${payload.id}" style="margin-left:8px">Open</a><div style="margin-top:6px;color:#666;font-size:0.9em">${escapeHtml(clientAddress)}</div>`;
          pendingList.insertBefore(el, pendingList.firstChild);
        }

        if (pendingPanel && pendingPanel.style.display === 'none')
          pendingPanel.style.display = 'block';
      } catch (e) {
        console.warn('new_weekly_plan handler error', e);
      }
    });

    socket.on('joined_order', (payload) => {
      // optional debug or UI reaction
      // console.debug('joined_order', payload);
    });

    socket.on('order_opened', (payload) => {
      // admin pages may react to client presence
    });

    socket.on('error', (err) => {
      console.warn('socket error', err);
    });

    // NEW: live admin dashboard updates
    socket.on('order_updated', (payload) => {
      try {
        const id = payload.orderId || payload.order_id;
        if (!id) return;
        const el = document.getElementById(`order-${id}`);
        if (el) {
          const small = el.querySelector('small');
          if (small) small.textContent = `(${payload.status || 'updated'})`;

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

          if (payload.status === 'accepted') {
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
          Array.from(el.querySelectorAll('button, form')).forEach(
            (n) => (n.style.display = 'none')
          );
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
    const panel = document.getElementById('pendingOrders');
    if (!panel) return;
    const item = document.createElement('div');
    item.className = 'pending-order-item';
    item.style.border = '1px solid #dfe6ef';
    item.style.padding = '10px';
    item.style.marginBottom = '8px';

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
    panel.insertBefore(item, panel.firstChild);

    const panelWrap = document.getElementById('pendingOrdersPanel');
    if (panelWrap && panelWrap.style.display === 'none')
      panelWrap.style.display = 'block';
  }

  function showOrderMessageNotification(payload) {
    console.info('Order message', payload);
    const panelWrap = document.getElementById('pendingOrdersPanel');
    if (panelWrap && panelWrap.style.display === 'none')
      panelWrap.style.display = 'block';
  }

  // If server injected ORDER_ID, auto-open that order (server-rendered page case)
  if (typeof window.ORDER_ID !== 'undefined' && window.ORDER_ID) {
    (async () => {
      const orderId = window.ORDER_ID;
      currentOrderId = orderId;
      window._mypadifood_chat = window._mypadifood_chat || {};
      window._mypadifood_chat.currentOrderId = currentOrderId;

      ensureSocket();
      try {
        socket.emit('join_order', { orderId });
      } catch (e) {
        console.warn('join_order emit failed', e);
      }

      await loadMessagesFor(orderId);

      const modal = document.getElementById('chatModal');
      if (modal) modal.style.display = 'block';

      try {
        const msgs = await fetch(`/chat/order/${orderId}`).then((r) =>
          r.json()
        );
        const bot =
          msgs.messages && msgs.messages.find((m) => m.sender_type === 'bot');
        const botArea = document.getElementById('botPromptArea');
        if (botArea) botArea.style.display = bot ? 'block' : 'none';
      } catch (e) {}
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
      s.emit('open_chat', { orderId });
    } catch (e) {
      console.warn('emit join_order/open_chat failed', e);
    }

    await loadMessagesFor(orderId);

    try {
      const msgs = await fetch(`/chat/order/${orderId}`).then((r) => r.json());
      const bot =
        msgs.messages && msgs.messages.find((m) => m.sender_type === 'bot');
      const botArea = document.getElementById('botPromptArea');
      if (botArea) botArea.style.display = bot ? 'block' : 'none';
    } catch (e) {}
  }

  // ===== loadMessagesFor =====
  async function loadMessagesFor(orderId) {
    if (!orderId) return;
    currentOrderId = orderId;
    try {
      const res = await fetch(`/chat/order/${orderId}`);
      const json = await res.json();
      const container = document.getElementById('chatMessages');
      if (!container) return;
      container.innerHTML = '';
      (json.messages || []).forEach((m) => appendMessage(m));
      container.scrollTop = container.scrollHeight;

      const titleEl = document.getElementById('chatTitle');
      const orderEl = document.getElementById('chatOrderId');
      if (titleEl) titleEl.textContent = 'Chat';
      if (orderEl) orderEl.textContent = `Order #${orderId}`;

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

  // ===== appendMessage =====
  function appendMessage(m) {
    const container = document.getElementById('chatMessages');
    if (!container || !m) return;

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
    body.textContent = text;

    wrapper.appendChild(header);
    wrapper.appendChild(body);

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
      } catch (err) {
        console.error('send message error', err);
      }
    }
  });

  // Bot Yes/No/Modify handlers (client-side)
  document.addEventListener('click', async (e) => {
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

        const botArea = document.getElementById('botPromptArea');
        if (botArea) botArea.style.display = 'none';

        if (headerYes) headerYes.style.display = 'none';
        if (headerNo) headerNo.style.display = 'none';

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

    // If viewing a weekly plan (admin or client view), auto-join that weekly_plan room
    try {
      const currentPlanIdEl = document.getElementById('currentWeeklyPlanId');
      if (currentPlanIdEl) {
        ensureSocket();
        const pid = String(currentPlanIdEl.value);
        if (pid) {
          try {
            socket.emit('join_weekly_plan', { planId: pid });
          } catch (e) {
            console.warn('join_weekly_plan failed', e);
          }
        }
      }
    } catch (e) {
      console.warn('weekly plan auto-join check failed', e);
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

    // Wire weekly-plan composer (send button) if present
    try {
      const sendBtn = document.getElementById('weeklyPlanSendBtn');
      const input = document.getElementById('weeklyPlanChatInput');
      const planIdEl = document.getElementById('currentWeeklyPlanId');

      if (sendBtn && input && planIdEl) {
        sendBtn.addEventListener('click', async function (ev) {
          ev.preventDefault();
          const text = input.value.trim();
          const planId = String(planIdEl.value);
          if (!text || !planId) return;
          try {
            const result = await window.sendWeeklyPlanMessage(planId, text);
            if (result && result.ok) {
              input.value = '';
            } else {
              alert(
                result && result.message
                  ? result.message
                  : 'Could not send message'
              );
            }
          } catch (e) {
            console.error('Failed to send weekly plan message', e);
            alert('Could not send message. Please try again.');
          }
        });
      }
    } catch (e) {
      console.warn('weekly plan composer wiring failed', e);
    }
  });
})();

// Small helpers for weekly-plan messages & client send
(function () {
  // helper to send weekly-plan message via REST (server persists and emits)
  window.sendWeeklyPlanMessage = async function (planId, text) {
    if (!planId || !text) return;
    try {
      const res = await fetch('/chat/weekly-plan/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId, message: text }),
      });
      return await res.json();
    } catch (e) {
      console.error('sendWeeklyPlanMessage error', e);
      throw e;
    }
  };

  // small html escape helper
  window.escapeHtml = function (s) {
    return (s + '').replace(/[&<>"']/g, function (c) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      }[c];
    });
  };
})();

/* Draggable chat: pointer-based dragging + persistence
   This runs in a separate IIFE so it can be pasted at the bottom of the file.
*/
(function enableChatDrag() {
  const modal = document.getElementById('chatModal');
  const handle = document.getElementById('chatDragHandle');
  if (!modal || !handle) return;

  const POS_KEY = 'mypadifood_chat_modal_pos_v1';

  try {
    const raw = localStorage.getItem(POS_KEY);
    if (raw) {
      const pos = JSON.parse(raw);
      if (pos && typeof pos.left === 'number' && typeof pos.top === 'number') {
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

  function clamp(x, min, max) {
    return Math.min(max, Math.max(min, x));
  }

  let dragging = false;
  let pointerId = null;
  let startX = 0,
    startY = 0;
  let startLeft = 0,
    startTop = 0;

  handle.style.touchAction = 'none';
  handle.style.cursor = 'grab';

  function onPointerDown(ev) {
    if (dragging) return;
    if (
      ev.target.closest('button') ||
      ev.target.nodeName === 'BUTTON' ||
      ev.target.getAttribute('role') === 'button'
    )
      return;

    pointerId = ev.pointerId;
    dragging = true;
    modal.classList.add('dragging');
    handle.style.cursor = 'grabbing';

    const rect = modal.getBoundingClientRect();
    if (!modal.style.left) modal.style.left = rect.left + 'px';
    if (!modal.style.top) modal.style.top = rect.top + 'px';
    modal.style.right = 'auto';
    modal.style.bottom = 'auto';

    startX = ev.clientX;
    startY = ev.clientY;
    startLeft = parseFloat(modal.style.left || rect.left);
    startTop = parseFloat(modal.style.top || rect.top);

    try {
      handle.setPointerCapture(pointerId);
    } catch (e) {}

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

    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
    document.removeEventListener('pointercancel', onPointerUp);

    ev.preventDefault();
  }

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

  handle.addEventListener('pointerdown', onPointerDown);

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

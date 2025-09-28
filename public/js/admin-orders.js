// public/js/admin-orders.js
// public/js/admin-orders.js (replace existing)
(function () {
  if (typeof io === "undefined") {
    console.warn("socket.io client not loaded");
    return;
  }

  const socket = io();

  socket.on("connect", () => {
    try {
      socket.emit("admin_join");
    } catch (e) {
      /* ignore */
    }
  });

  // Toggle panels
  document.addEventListener("click", (ev) => {
    if (ev.target.matches("#nav-pending-orders")) {
      ev.preventDefault();
      const panel = document.getElementById("pendingOrdersPanel");
      if (panel) panel.style.display = panel.style.display === "none" ? "block" : "none";
    }
    if (ev.target.matches("#nav-completed-orders")) {
      ev.preventDefault();
      const panel = document.getElementById("completedOrdersPanel");
      if (panel) panel.style.display = panel.style.display === "none" ? "block" : "none";
    }
    if (ev.target.matches("#nav-notifications")) {
      ev.preventDefault();
      const panel = document.getElementById("notificationsPanel");
      if (panel) panel.style.display = panel.style.display === "none" ? "block" : "none";
    }
  });

  // helper: render order card
  function renderOrderCard(o, opts = {}) {
    const cls = opts.completed ? "order-card completed" : "order-card";
    const clientName = escapeHtml(o.client_name || o.clientName || "Client");
    const vendorName = escapeHtml(o.vendor_name || o.vendorName || "");
    const item = escapeHtml(o.item || "[none]");
    const id = escapeHtml(o.id);
    const statusBadge = opts.completed
      ? `<span class="completed-badge" style="background:#f1f5f9;color:#111;padding:4px 8px;border-radius:8px;font-weight:700;">Completed</span>`
      : "";
    return `<div id="order-card-${id}" class="${cls}" data-order-id="${id}" style="border:1px solid rgba(0,0,0,0.04);">
      <div class="order-meta"><strong>Order:</strong> ${id} ${statusBadge}</div>
      <div class="order-client"><strong>Client:</strong> ${clientName}</div>
      <div class="order-vendor"><strong>Vendor:</strong> ${vendorName}</div>
      <div class="order-item"><strong>Item:</strong> ${item}</div>
      <div class="order-actions" style="margin-top:8px;">
        <button class="open-order btn" data-order-id="${id}">Open</button>
      </div>
    </div>`;
  }

  // click handlers: open order, mark-notif click
  document.addEventListener("click", async (ev) => {
    const t = ev.target;
    if (t.matches(".open-order")) {
      const id = t.dataset.orderId;
      if (id) window.location.href = `/admin/orders/${id}`;
    }

    // notifications click: make notif clickable to open order
    if (t.closest && t.closest(".admin-notif")) {
      const wrapper = t.closest(".admin-notif");
      const orderId = wrapper && (wrapper.dataset.orderId || wrapper.getAttribute("data-order-id"));
      if (orderId) {
        window.location.href = `/admin/orders/${orderId}`;
      }
    }
  });

  // initial_admin_state (render both pending and completed if present)
  socket.on("initial_admin_state", (payload) => {
    try {
      const { orders = [], notifications = [] } = payload || {};
      const pendingContainer = document.getElementById("pendingOrders");
      const notifPanel = document.getElementById("notificationsPanel");

      if (pendingContainer) {
        pendingContainer.innerHTML = orders.map((o) => renderOrderCard(o)).join("");
      }
      if (notifPanel) {
        if (!notifications || notifications.length === 0) {
          notifPanel.innerHTML =
            '<div class="admin-notif-empty" style="color:var(--muted)">No notifications</div>';
        } else {
          notifPanel.innerHTML = notifications
            .map((n) => {
              // ensure order id is exposed so click opens the order
              const orderId =
                n.order_id || (n.payload && (n.payload.order_id || n.payload.orderId)) || "";
              const payloadText =
                (n.payload &&
                  (n.payload.order_summary || n.payload.item || JSON.stringify(n.payload))) ||
                "";
              return `<div class="admin-notif" data-order-id="${escapeHtml(orderId)}" data-id="${escapeHtml(n.id)}">
              <div><strong>${escapeHtml(n.type)}</strong> — ${escapeHtml((n.payload && (n.payload.client_name || n.payload.clientName)) || "")}</div>
              <div class="payload" style="font-size:0.9em;color:#666">${escapeHtml(payloadText)}</div>
              <div style="margin-top:6px;"><button class="mark-read" data-id="${escapeHtml(n.id)}">Mark read</button></div>
            </div>`;
            })
            .join("");
        }
        // update badge
        const badge = document.getElementById("notifBadge");
        if (badge) badge.textContent = notifications.length ? String(notifications.length) : "";
      }
    } catch (e) {
      console.error("initial_admin_state error", e);
    }
  });

  socket.on("new_order", (data) => {
    try {
      const pendingContainer = document.getElementById("pendingOrders");
      if (pendingContainer && data && data.id) {
        pendingContainer.insertAdjacentHTML("afterbegin", renderOrderCard(data));
      }
      // optional notif
      if (window.Notification && Notification.permission === "granted")
        new Notification("New order", {
          body: `${data.client_name || "Client"}`,
        });
    } catch (e) {
      console.error("new_order error", e);
    }
  });

  socket.on("order_message", (payload) => {
    try {
      const orderId = payload && (payload.orderId || payload.order_id || payload.order);
      const message = payload && (payload.message || payload.msg || payload);
      if (!orderId) return;
      const card = document.getElementById(`order-card-${orderId}`);
      if (!card) {
        // create it if missing
        const container = document.getElementById("pendingOrders");
        if (container)
          container.insertAdjacentHTML(
            "afterbegin",
            renderOrderCard({
              id: orderId,
              client_name: payload.client_name || payload.clientName || "",
            })
          );
      }
      // visually highlight
      const c = document.getElementById(`order-card-${orderId}`);
      if (c) c.style.border = "2px solid #2b8aef";
    } catch (e) {
      console.error("order_message handler error", e);
    }
  });

  // When an order is marked completed by someone, mark it visually and move to completed panel
  socket.on("order_completed", ({ orderId }) => {
    try {
      const card = document.getElementById(`order-card-${orderId}`);
      const completedContainer = document.getElementById("completedOrders");
      if (card && completedContainer) {
        // mark visually
        card.classList.add("completed");
        card
          .querySelector(".order-meta")
          .insertAdjacentHTML("beforeend", ` <span class="completed-badge">Completed</span>`);
        // move it into completed container
        completedContainer.prepend(card);
      } else if (!card && completedContainer) {
        // If not present, fetch latest completed via API? simple fallback: reload panel via AJAX
        fetch("/admin/orders/completed?format=json")
          .then((r) => r.json())
          .then((json) => {
            if (json && json.orders) {
              completedContainer.innerHTML = json.orders
                .map((o) => renderOrderCard(o, { completed: true }))
                .join("");
            }
          })
          .catch((e) => console.error("Failed to refresh completed orders", e));
      }
    } catch (e) {
      console.error("order_completed handler error", e);
    }
  });

  // new_notification - insert clickable notif
  socket.on("new_notification", (n) => {
    try {
      const notifPanel = document.getElementById("notificationsPanel");
      if (!notifPanel) return;
      const orderId = n.order_id || (n.payload && (n.payload.order_id || n.payload.orderId)) || "";
      const payloadText =
        (n.payload && (n.payload.order_summary || n.payload.item || JSON.stringify(n.payload))) ||
        "";
      const html = `<div class="admin-notif" data-order-id="${escapeHtml(orderId)}" data-id="${escapeHtml(n.id)}">
          <div><strong>${escapeHtml(n.type)}</strong> — ${escapeHtml((n.payload && (n.payload.client_name || n.payload.clientName)) || "")}</div>
          <div class="payload" style="font-size:0.9em;color:#666">${escapeHtml(payloadText)}</div>
          <div style="margin-top:6px;"><button class="mark-read" data-id="${escapeHtml(n.id)}">Mark read</button></div>
        </div>`;
      notifPanel.insertAdjacentHTML("afterbegin", html);
      // increment badge
      const b = document.getElementById("notifBadge");
      if (b) {
        const cur = parseInt(b.textContent || "0", 10) || 0;
        b.textContent = String(cur + 1);
      }
    } catch (e) {
      console.error("new_notification handler error", e);
    }
  });

  // Mark-read (delegated)
  document.addEventListener("click", async (ev) => {
    const btn = ev.target;
    if (btn.classList.contains("mark-read")) {
      const id = btn.dataset.id;
      if (!id) return;
      try {
        const resp = await fetch(`/admin/notifications/${encodeURIComponent(id)}/read`, {
          method: "POST",
        });
        if (resp.ok) {
          const wrapper = btn.closest(".admin-notif");
          if (wrapper) wrapper.remove();
          const b = document.getElementById("notifBadge");
          if (b) {
            const cur = parseInt(b.textContent || "0", 10) || 0;
            b.textContent = cur > 1 ? String(cur - 1) : "";
          }
        } else {
          console.error("Mark read failed", resp.status);
        }
      } catch (e) {
        console.error("Mark read failed", e);
      }
    }
  });

  // Assistive helpers
  function escapeHtml(s) {
    if (s === null || s === undefined) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // Expose socket for debugging
  window._mypadifood_adminOrdersSocket = socket;
})();

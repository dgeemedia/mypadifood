// public/js/admin-withdrawals.js
(function () {
  'use strict';
  const socket = io();

  socket.on('connect', () => {
    // Optionally request server to put socket into 'admins' room if implemented:
    // socket.emit('join_admins');
  });

  // handle new_withdrawal realtime update
  socket.on('new_withdrawal', (payload) => {
    try {
      const tbody = document.querySelector('#withdrawals-table tbody');
      if (!tbody) return;
      const row = document.createElement('tr');
      row.dataset.id = payload.id;
      const clientHtml = `<strong>${payload.client_name || 'Client'}</strong><div class="muted">${payload.client_email || ''} • ${payload.client_phone || ''}</div>`;
      const dest = typeof payload.destination === 'object'
        ? `<div><strong>Bank:</strong> ${payload.destination.bank || ''}</div><div><strong>Acct:</strong> ${payload.destination.account_number || ''} (${payload.destination.account_name || ''})</div>`
        : (payload.destination || '—');
      row.innerHTML = '<td>' + clientHtml + '</td>' +
                      '<td>' + (payload.amount ? Number(payload.amount).toFixed(2) : '0.00') + '</td>' +
                      '<td>' + dest + '</td>' +
                      '<td>' + (payload.created_at ? new Date(payload.created_at).toLocaleString() : '') + '</td>' +
                      '<td>' + (payload.note || '') + '</td>' +
                      `<td>
                        <button class="btn btn-sm btn-primary btn-approve" data-id="${payload.id}">Approve</button>
                        <button class="btn btn-sm btn-danger btn-decline" data-id="${payload.id}">Decline</button>
                        <a href="/admin/withdrawals/${payload.id}" class="btn btn-sm btn-link">View</a>
                      </td>`;
      tbody.insertBefore(row, tbody.firstChild);
      // small toast UI could be used instead of alert
      console.info('New withdrawal received:', payload.id);
    } catch (e) {
      console.warn('new_withdrawal handler error', e);
    }
  });

  // Modal helpers (assumes modal markup exists)
  function openModal(modal) { if (modal) modal.style.display = 'flex'; }
  function closeModal(modal) { if (modal) modal.style.display = 'none'; }

  document.addEventListener('click', (ev) => {
    const approveBtn = ev.target.closest && ev.target.closest('.btn-approve');
    const declineBtn = ev.target.closest && ev.target.closest('.btn-decline');

    if (approveBtn) {
      const id = approveBtn.dataset.id;
      const modal = document.getElementById('modal-approve');
      const form = document.getElementById('form-approve');
      if (!form || !modal) return;
      form.action = `/admin/withdrawals/${encodeURIComponent(id)}/approve`;
      form.querySelector('input[name="id"]').value = id;
      openModal(modal);
      return;
    }

    if (declineBtn) {
      const id = declineBtn.dataset.id;
      const modal = document.getElementById('modal-decline');
      const form = document.getElementById('form-decline');
      if (!form || !modal) return;
      form.action = `/admin/withdrawals/${encodeURIComponent(id)}/decline`;
      form.querySelector('input[name="id"]').value = id;
      openModal(modal);
      return;
    }
  });

  const approveCancel = document.getElementById('approve-cancel');
  if (approveCancel) approveCancel.addEventListener('click', () => closeModal(document.getElementById('modal-approve')));
  const declineCancel = document.getElementById('decline-cancel');
  if (declineCancel) declineCancel.addEventListener('click', () => closeModal(document.getElementById('modal-decline')));

})();

// public/js/admin-riders-pending.js
(function () {
  function qs(selector, ctx) { return (ctx || document).querySelector(selector); }
  function qsa(selector, ctx) { return Array.from((ctx || document).querySelectorAll(selector)); }
  function showTempMsg(container, msg, ok = true) {
    const el = document.createElement('div');
    el.className = ok ? 'flash flash-success' : 'flash flash-error';
    el.textContent = msg;
    container.insertBefore(el, container.firstChild);
    setTimeout(() => {
      if (el && el.parentNode) el.parentNode.removeChild(el);
    }, 4000);
  }

  async function postDecision(riderId, decision, reason) {
    const body = new URLSearchParams();
    body.append('riderId', riderId);
    body.append('decision', decision);
    if (reason) body.append('reason', reason);

    const resp = await fetch('/admin/resources/riders/decision', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: body.toString()
    });
    return resp;
  }

  function wireButtons() {
    const table = qs('table.resources-table');
    if (!table) return;

    // Approve buttons
    qsa('button[data-action="approve"]').forEach(btn => {
      btn.addEventListener('click', async (ev) => {
        ev.preventDefault();
        const riderId = btn.dataset.riderId;
        if (!riderId) return;
        const ok = window.confirm('Approve this rider application? This will make them available in resources.');
        if (!ok) return;

        btn.disabled = true;
        try {
          const resp = await postDecision(riderId, 'approve', '');
          if (!resp.ok) throw new Error('Server error');
          const json = await resp.json();
          if (json && json.ok) {
            // remove the row from table OR mark as approved
            const row = btn.closest('tr');
            if (row) {
              row.parentNode.removeChild(row);
            }
            const container = document.querySelector('.account-page') || document.body;
            showTempMsg(container, 'Rider approved');
          } else {
            throw new Error((json && json.error) || 'Unknown error');
          }
        } catch (e) {
          console.error('Approve error', e);
          const container = document.querySelector('.account-page') || document.body;
          showTempMsg(container, 'Could not approve rider', false);
          btn.disabled = false;
        }
      });
    });

    // Reject buttons (with optional reason text input sibling)
    qsa('button[data-action="reject"]').forEach(btn => {
      btn.addEventListener('click', async (ev) => {
        ev.preventDefault();
        const riderId = btn.dataset.riderId;
        if (!riderId) return;

        // find optional reason input (same row)
        const row = btn.closest('tr');
        const reasonInput = row ? row.querySelector('input[name="reason"]') : null;
        const reason = reasonInput ? reasonInput.value.trim() : '';

        const ok = window.confirm('Reject this rider application? This action can be accompanied by an optional reason.');
        if (!ok) return;

        btn.disabled = true;
        try {
          const resp = await postDecision(riderId, 'reject', reason);
          if (!resp.ok) throw new Error('Server error');
          const json = await resp.json();
          if (json && json.ok) {
            // Mark row visually as rejected
            const r = btn.closest('tr');
            if (r) {
              r.classList.add('muted');
              const actionCell = r.querySelector('td:last-child');
              if (actionCell) actionCell.innerHTML = '<em>Rejected</em>';
            }
            const container = document.querySelector('.account-page') || document.body;
            showTempMsg(container, 'Rider rejected');
          } else {
            throw new Error((json && json.error) || 'Unknown error');
          }
        } catch (e) {
          console.error('Reject error', e);
          const container = document.querySelector('.account-page') || document.body;
          showTempMsg(container, 'Could not reject rider', false);
          btn.disabled = false;
        }
      });
    });
  }

  // init on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireButtons);
  } else {
    setTimeout(wireButtons, 0);
  }
})();

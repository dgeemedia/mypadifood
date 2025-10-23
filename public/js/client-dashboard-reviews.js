// public/js/client-dashboard-reviews.js
document.addEventListener('DOMContentLoaded', () => {
  // debug:
  console.log(
    'reviews script loaded — buttons found:',
    document.querySelectorAll('.btn-leave-review').length
  );

  // re-run binding if buttons might be added later
  function bindButtons() {
    document.querySelectorAll('.btn-leave-review').forEach((btn) => {
      if (btn.dataset._bound) return;
      btn.dataset._bound = '1';
      btn.addEventListener('click', () => {
        const vendorId = btn.dataset.vendorId;
        const vendorName = btn.dataset.vendorName || '';
        const orderId = btn.dataset.orderId;
        // openModal is in the file; ensure openModal exists
        if (typeof openModal === 'function')
          openModal({ vendorId, vendorName, orderId });
        else console.warn('openModal not defined');
      });
    });
  }
  bindButtons();
  // helpful if SPA updates buttons later:
  setTimeout(bindButtons, 500);
});

document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('review-modal');
  const backdrop = modal && modal.querySelector('.modal-backdrop');
  const form = document.getElementById('review-modal-form');
  const closeBtn = document.getElementById('review-modal-close');
  const cancelBtn = document.getElementById('review-modal-cancel');
  const msg = document.getElementById('review-modal-msg');

  function openModal({ vendorId, vendorName, orderId }) {
    document.getElementById('review-vendor-id').value = vendorId || '';
    document.getElementById('review-vendor-name').textContent =
      vendorName || '';
    document.getElementById('review-order-id').value = orderId || '';
    document.getElementById('review-rating').value = '';
    document.getElementById('review-comment').value = '';
    msg.textContent = '';
    modal.style.display = '';
    modal.setAttribute('aria-hidden', 'false');
  }

  function closeModal() {
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
  }

  // Attach to all "Leave review" buttons
  document.querySelectorAll('.btn-leave-review').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const vendorId = btn.dataset.vendorId;
      const vendorName = btn.dataset.vendorName || '';
      const orderId = btn.dataset.orderId;
      openModal({ vendorId, vendorName, orderId });
    });
  });

  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
  if (backdrop) backdrop.addEventListener('click', closeModal);

  // submit form via fetch
  if (form) {
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const vendorId = document.getElementById('review-vendor-id').value;
      const orderId = document.getElementById('review-order-id').value;
      const rating = document.getElementById('review-rating').value;
      const comment = document.getElementById('review-comment').value;

      if (!vendorId || !rating) {
        msg.textContent = 'Vendor and rating are required';
        return;
      }

      const url = `/client/vendor/${encodeURIComponent(vendorId)}/reviews`;
      const payload = { orderId: orderId || null, rating, comment };

      try {
        const resp = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          credentials: 'same-origin',
          body: JSON.stringify(payload),
        });

        if (resp.ok) {
          const j = await resp.json().catch(() => null);
          if (j && j.ok) {
            msg.style.color = 'green';
            msg.textContent = 'Review posted — refreshing...';
            setTimeout(() => window.location.reload(), 700);
            return;
          }
        }

        const text = await resp.text().catch(() => null);
        msg.style.color = 'crimson';
        msg.textContent =
          text && text.length ? `Error: ${text}` : 'Could not post review';
      } catch (err) {
        console.error(err);
        msg.style.color = 'crimson';
        msg.textContent = 'Network error while posting review';
      }
    });
  }
});

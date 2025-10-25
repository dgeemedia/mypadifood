// public/js/client-dashboard-reviews.js
// Handles "Leave review" modal open/submit for dashboard/vendor pages.

document.addEventListener('DOMContentLoaded', () => {
  // If modal was rendered inside a wrapper, move it to body so stacking context doesn't cover it.
  try {
    const modal = document.getElementById('review-modal');
    if (modal && modal.parentNode !== document.body) {
      document.body.appendChild(modal);
      modal.style.position = 'fixed';
    }
  } catch (e) {
    // non-fatal
    console.warn('Could not move review-modal to body', e);
  }

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
        if (typeof openModal === 'function')
          openModal({ vendorId, vendorName, orderId });
        else {
          // openModal defined below in same file; call it directly if already defined
          try {
            window.__openReviewModal &&
              window.__openReviewModal({ vendorId, vendorName, orderId });
          } catch (err) {
            console.warn('openModal not defined', err);
          }
        }
      });
    });
  }
  bindButtons();
  // helpful if SPA updates buttons later:
  setTimeout(bindButtons, 500);
});

document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('review-modal');
  if (!modal) {
    console.warn('review-modal not found in DOM');
    return;
  }
  const backdrop = modal.querySelector('.modal-backdrop');
  const form = document.getElementById('review-modal-form');
  const closeBtn = document.getElementById('review-modal-close');
  const cancelBtn = document.getElementById('review-modal-cancel');
  const msg = document.getElementById('review-modal-msg');

  // expose a safe global open in case bindButtons tried to call earlier
  window.__openReviewModal = openModal;

  function openModal({ vendorId, vendorName, orderId }) {
    const vidEl = document.getElementById('review-vendor-id');
    const vnameEl = document.getElementById('review-vendor-name');
    const oidEl = document.getElementById('review-order-id');
    const ratingEl = document.getElementById('review-rating');
    const commentEl = document.getElementById('review-comment');

    if (vidEl) vidEl.value = vendorId || '';
    if (vnameEl) vnameEl.textContent = vendorName || '';
    if (oidEl) oidEl.value = orderId || '';
    if (ratingEl) ratingEl.value = '';
    if (commentEl) commentEl.value = '';
    if (msg) msg.textContent = '';

    // show modal
    modal.style.display = '';
    modal.setAttribute('aria-hidden', 'false');

    // focus first control
    if (ratingEl) ratingEl.focus();

    // ESC to close
    document.addEventListener('keydown', escClose);
  }

  function closeModal() {
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
    document.removeEventListener('keydown', escClose);
  }

  function escClose(e) {
    if (e.key === 'Escape') closeModal();
  }

  // Attach to all "Leave review" buttons (redundant binding safe)
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
      const vendorId = (document.getElementById('review-vendor-id') || {})
        .value;
      const orderId = (document.getElementById('review-order-id') || {}).value;
      const rating = (document.getElementById('review-rating') || {}).value;
      const comment = (document.getElementById('review-comment') || {}).value;

      if (!vendorId || !rating) {
        if (msg) {
          msg.style.color = 'crimson';
          msg.textContent = 'Vendor and rating are required';
        }
        return;
      }

      const url = `/client/vendor/${encodeURIComponent(vendorId)}/reviews`;
      // include vendorId explicitly in body for server compatibility
      const payload = {
        vendorId,
        orderId: orderId || null,
        rating,
        comment,
      };

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
            if (msg) {
              msg.style.color = 'green';
              msg.textContent = 'Review posted — refreshing...';
            }
            setTimeout(() => window.location.reload(), 700);
            return;
          }
        }

        const text = await resp.text().catch(() => null);
        if (msg) {
          msg.style.color = 'crimson';
          msg.textContent =
            text && text.length ? `Error: ${text}` : 'Could not post review';
        }
      } catch (err) {
        console.error(err);
        if (msg) {
          msg.style.color = 'crimson';
          msg.textContent = 'Network error while posting review';
        }
      }
    });
  }
});

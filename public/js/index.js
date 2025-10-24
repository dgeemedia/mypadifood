// public/js/index.js
document.addEventListener('DOMContentLoaded', () => {
  // Quick-order modal wiring and cross-behavior handling
  const modal = document.getElementById('quick-order-modal');
  const qoForm = document.getElementById('quick-order-form');
  const qoVendorId = document.getElementById('qo-vendorId');
  const qoTitle = document.getElementById('qo-title');

  function openQuickOrder({ id, name }) {
    if (!modal) return;
    if (qoVendorId) qoVendorId.value = id || '';
    if (qoTitle) qoTitle.textContent = `Quick order — ${name || ''}`;
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    const first = modal.querySelector('input, select, textarea, button');
    if (first) first.focus();
  }
  function closeQuickOrder() {
    if (!modal) return;
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  // Delegate quick-order clicks (handles buttons injected after load too)
  document.addEventListener('click', (e) => {
    const btn = e.target.closest && e.target.closest('.quick-order');
    if (!btn) return;
    const vendorId = btn.dataset.vendorId;
    const vendorName = btn.dataset.vendorName || '';
    const loggedIn = btn.dataset.loggedIn; // set by template
    if (!loggedIn) {
      const next = encodeURIComponent(btn.dataset.next || `/vendor/${vendorId}`);
      window.location.href = `/login?next=${next}`;
      return;
    }
    openQuickOrder({ id: vendorId, name: vendorName });
  });

  // modal close / cancel
  document.addEventListener('click', (ev) => {
    if (ev.target.closest && ev.target.closest('.modal-close')) closeQuickOrder();
    if (ev.target.closest && ev.target.closest('.modal-cancel')) closeQuickOrder();
  });
  if (modal) {
    modal.addEventListener('click', (ev) => { if (ev.target === modal) closeQuickOrder(); });
  }

  // ESC close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal && modal.getAttribute('aria-hidden') === 'false') closeQuickOrder();
  });

  // favorite button toggle (UI-only; can POST to server endpoint if implemented)
  document.addEventListener('click', (ev) => {
    const f = ev.target.closest && ev.target.closest('.fav-btn');
    if (!f) return;
    const pressed = f.getAttribute('aria-pressed') === 'true';
    f.setAttribute('aria-pressed', String(!pressed));
    f.textContent = !pressed ? '♥' : '♡';
    // TODO: persist with fetch POST /client/favorite if you add route
  });

  // Show more / infinite scroll fallback
  (function vendorReveal() {
    const grid = document.getElementById('vendors-grid');
    if (!grid) return;
    const initial = Number(grid.dataset.initial || 9);
    const hiddenCards = Array.from(grid.querySelectorAll('.vendor-hidden'));
    const showMoreBtn = document.getElementById('show-more');

    const hiddenQueue = hiddenCards.slice(); // copy

    function revealNext(n = 6) {
      for (let i = 0; i < n && hiddenQueue.length; i++) {
        const c = hiddenQueue.shift();
        if (!c) break;
        c.classList.remove('vendor-hidden');
      }
      if (hiddenQueue.length === 0 && showMoreBtn) showMoreBtn.style.display = 'none';
    }

    if (showMoreBtn) {
      showMoreBtn.addEventListener('click', (e) => revealNext(6));
    }

    // sentinel + IntersectionObserver autoload
    const sentinel = document.createElement('div');
    sentinel.id = 'vendor-sentinel';
    grid.parentNode.appendChild(sentinel);
    const io = new IntersectionObserver((entries) => {
      entries.forEach(en => {
        if (en.isIntersecting && hiddenQueue.length) revealNext(6);
      });
    }, { root: null, rootMargin: '400px', threshold: 0 });
    io.observe(sentinel);
  })();

  // Partners auto-scroll simple loop (non-blocking)
  (function partnersAutoScroll() {
    const pr = document.querySelector('.partners-row');
    if (!pr) return;
    let px = 0;
    setInterval(() => {
      if (!pr.scrollWidth) return;
      px += 120;
      if (px > pr.scrollWidth - pr.clientWidth) px = 0;
      pr.scrollTo({ left: px, behavior: 'smooth' });
    }, 3000);
  })();

  // Quick-order AJAX submit (graceful fallback to server POST)
  if (qoForm) {
    qoForm.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const formData = new FormData(qoForm);
      try {
        const resp = await fetch(qoForm.action, {
          method: qoForm.method || 'POST',
          body: formData,
          credentials: 'same-origin',
          headers: { 'Accept': 'application/json' },
        });
        if (resp.ok) {
          const j = await resp.json().catch(() => null);
          // If server returns JSON with redirect, go there; otherwise refresh.
          if (j && j.redirect) {
            window.location = j.redirect;
          } else {
            window.location.reload();
          }
        } else {
          // show server response text (if any) or fallback message
          const txt = await resp.text().catch(() => resp.statusText);
          alert('Order failed: ' + (txt || resp.statusText));
        }
      } catch (err) {
        console.error('Quick order error, falling back to native submit', err);
        qoForm.submit();
      }
    });
  }
});

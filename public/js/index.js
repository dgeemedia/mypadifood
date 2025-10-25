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

/* =========================
   Continuous marquee helpers
   Append this to public/js/index.js (bottom)
   ========================= */

(function setupMarquees() {
  // small helper to create a continuous horizontal marquee from a container's direct children
  function createMarquee(containerSelector, speed = 40 /* px/s */, reverse = false) {
    const container = document.querySelector(containerSelector);
    if (!container) return;

    // wrap children in a scroller
    container.style.overflow = 'hidden';
    container.style.position = 'relative';
    container.style.whiteSpace = 'nowrap';
    container.style.display = 'flex';
    container.style.gap = '12px';
    container.style.alignItems = 'center';

    // hide scrollbar on all platforms
    container.style.scrollBehavior = 'auto';
    container.classList.add('marquee-container');

    // build content wrapper that will be duplicated
    const children = Array.from(container.children);
    if (children.length === 0) return;

    // if there's just one child, duplicate it to make a loop
    // create inner wrapper and move children into it
    const inner = document.createElement('div');
    inner.className = 'marquee-inner';
    inner.style.display = 'inline-flex';
    inner.style.alignItems = 'center';
    inner.style.gap = '12px';
    inner.style.willChange = 'transform';

    // move original children into inner
    children.forEach((ch) => inner.appendChild(ch));

    // duplicate content to allow seamless loop
    const innerClone = inner.cloneNode(true);

    // empty container then append wrappers
    container.innerHTML = '';
    container.appendChild(inner);
    container.appendChild(innerClone);

    // measure total width
    function getContentWidth() {
      return inner.getBoundingClientRect().width;
    }

    let contentWidth = getContentWidth();
    let pos = 0;
    let lastTs = performance.now();
    let paused = false;

    // pause on hover/focus
    container.addEventListener('mouseenter', () => (paused = true));
    container.addEventListener('mouseleave', () => (paused = false));
    container.addEventListener('focusin', () => (paused = true));
    container.addEventListener('focusout', () => (paused = false));

    function step(ts) {
      const dt = Math.min(60, ts - lastTs) / 1000;
      lastTs = ts;
      if (!paused) {
        pos += (reverse ? -1 : 1) * speed * dt;
        // wrap
        if (pos > contentWidth) pos -= contentWidth;
        if (pos < 0) pos += contentWidth;
        inner.style.transform = `translateX(${ -pos }px)`;
        innerClone.style.transform = `translateX(${ -pos }px)`;
      }
      requestAnimationFrame(step);
    }

    // on resize recalc width
    window.addEventListener('resize', () => {
      contentWidth = getContentWidth();
    });

    requestAnimationFrame(step);
  }

  // featured vendors marquee (selector used from home template)
  createMarquee('.featured-scroller', 36);

  // partners marquee (slower)
  createMarquee('.partners-row', 28);

  // testimonials marquee — if you want testimonials to flow horizontally instead of grid,
  // change the markup of testimonials to a horizontal scroller. If you keep the grid,
  // we will not transform it. Example below only applies if you swap .testi-grid to a row.
  // To keep things simple: we toggle an auto-scroll for .testi-grid if it has many items
  const testiGrid = document.querySelector('.testi-grid');
  if (testiGrid && testiGrid.children.length > 3) {
    // convert to a horizontal marquee layout only for desktop widths
    if (window.innerWidth > 720) {
      testiGrid.style.display = 'flex';
      testiGrid.style.flexWrap = 'nowrap';
      testiGrid.style.gap = '12px';
      testiGrid.style.overflow = 'hidden';
      testiGrid.style.alignItems = 'center';
      createMarquee('.testi-grid', 24);
    }
  }
})();

// public/js/index.js
// Updated quick-order modal / redirect wiring + existing dashboard helpers
(function () {
  'use strict';

  // ---------- tiny DOM helpers ----------
  function $all(sel, ctx) {
    return Array.from((ctx || document).querySelectorAll(sel));
  }
  function $one(sel, ctx) {
    return (ctx || document).querySelector(sel);
  }

  // ---------- Quick order modal handlers ----------
  document.addEventListener('DOMContentLoaded', () => {
    // modal elements
    const modal = document.getElementById('quick-order-modal');
    const qoForm = document.getElementById('quick-order-form');
    const qoVendorId = document.getElementById('qo-vendorId');
    const qoTitle = document.getElementById('qo-title');

    // helper: are we logged in? prefer server-provided flag
    function isLoggedIn() {
      if (typeof window.__LOGGED_IN !== 'undefined') return !!window.__LOGGED_IN;
      return !!document.querySelector('.quick-order[data-logged-in="1"]');
    }

    function openQuickOrder({ id, name }) {
      if (!modal) return;
      if (qoVendorId) qoVendorId.value = id || '';
      if (qoTitle) qoTitle.textContent = name ? `Quick order — ${name}` : 'Quick order';
      modal.setAttribute('aria-hidden', 'false');
      modal.style.display = 'flex';
      // prevent background scroll while modal open
      document.body.style.overflow = 'hidden';
      // focus first control
      try {
        const first = modal.querySelector('input:not([type="hidden"]), select, textarea, button');
        if (first) first.focus();
      } catch (e) {}
    }

    function closeQuickOrder() {
      if (!modal) return;
      modal.setAttribute('aria-hidden', 'true');
      modal.style.display = 'none';
      document.body.style.overflow = '';
    }

    // Delegate clicks for quick-order buttons (handles dynamically-inserted buttons)
    document.addEventListener('click', (e) => {
      const btn = e.target.closest && e.target.closest('.quick-order');
      if (!btn) return;

      e.preventDefault();
      const vendorId = btn.dataset.vendorId || '';
      const vendorName = btn.dataset.vendorName || '';
      const btnLogged = btn.dataset.loggedIn && String(btn.dataset.loggedIn).trim() !== '';

      // if explicit per-button logged flag present, prefer that; otherwise global check
      const logged = btnLogged ? true : isLoggedIn();

      if (!logged) {
        // not signed in — redirect to login but next must return to dashboard orders for that vendor
        const nextUrl = `/client/dashboard?vendorId=${encodeURIComponent(vendorId)}#section-orders`;
        window.location.href = '/login?next=' + encodeURIComponent(nextUrl);
        return;
      }

      // signed-in -> open quick order modal for confirmation (dashboard will handle actual order flow)
      openQuickOrder({ id: vendorId, name: vendorName });
    });

    // modal close / cancel binding
    document.addEventListener('click', (ev) => {
      if (ev.target.closest && ev.target.closest('.modal-close')) closeQuickOrder();
      if (ev.target.closest && ev.target.closest('.modal-cancel')) closeQuickOrder();
    });
    if (modal) {
      modal.addEventListener('click', (ev) => {
        if (ev.target === modal) closeQuickOrder();
      });
    }
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && modal && modal.getAttribute('aria-hidden') === 'false') closeQuickOrder();
    });

    // On modal submit => redirect to dashboard (signed) or login (shouldn't usually happen because we only open modal when signed)
    if (qoForm) {
      qoForm.addEventListener('submit', function (ev) {
        ev.preventDefault(); // we're redirecting to dashboard (which will open booking UI)
        const vendorId = (qoVendorId && qoVendorId.value) ? qoVendorId.value : '';
        const next = `/client/dashboard?vendorId=${encodeURIComponent(vendorId)}#section-orders`;

        if (isLoggedIn()) {
          // Signed-in users: navigate to dashboard where order flow is handled
          window.location.href = next;
        } else {
          // Fallback: not signed in -> go to login with next
          window.location.href = '/login?next=' + encodeURIComponent(next);
        }
      });
    }

    // Favorite button toggle (UI only — you can hook to server endpoint if implemented)
    document.addEventListener('click', (ev) => {
      const f = ev.target.closest && ev.target.closest('.fav-btn');
      if (!f) return;
      const pressed = f.getAttribute('aria-pressed') === 'true';
      f.setAttribute('aria-pressed', String(!pressed));
      f.textContent = !pressed ? '♥' : '♡';
      // TODO: send fetch POST to persist favorite at /client/favorite or similar
    });
  });

  // ---------- Vendor reveal / show-more / sentinel ----------
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
    try {
      const sentinel = document.createElement('div');
      sentinel.id = 'vendor-sentinel';
      grid.parentNode.appendChild(sentinel);
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((en) => {
            if (en.isIntersecting && hiddenQueue.length) revealNext(6);
          });
        },
        { root: null, rootMargin: '400px', threshold: 0 }
      );
      io.observe(sentinel);
    } catch (e) {
      // older browsers: no IO — do nothing (user can click Show more)
    }
  })();

  // ---------- Partners auto-scroll simple loop ----------
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

  // ---------- Quick marquees (featured / partners / optionally testi) ----------
  (function setupMarquees() {
    function createMarquee(containerSelector, speed = 40, reverse = false) {
      const container = document.querySelector(containerSelector);
      if (!container) return;

      container.style.overflow = 'hidden';
      container.style.position = 'relative';
      container.style.whiteSpace = 'nowrap';
      container.style.display = 'flex';
      container.style.gap = '12px';
      container.style.alignItems = 'center';
      container.style.scrollBehavior = 'auto';
      container.classList.add('marquee-container');

      const children = Array.from(container.children);
      if (children.length === 0) return;

      const inner = document.createElement('div');
      inner.className = 'marquee-inner';
      inner.style.display = 'inline-flex';
      inner.style.alignItems = 'center';
      inner.style.gap = '12px';
      inner.style.willChange = 'transform';

      children.forEach((ch) => inner.appendChild(ch));
      const innerClone = inner.cloneNode(true);

      container.innerHTML = '';
      container.appendChild(inner);
      container.appendChild(innerClone);

      function getContentWidth() { return inner.getBoundingClientRect().width; }
      let contentWidth = getContentWidth();
      let pos = 0;
      let lastTs = performance.now();
      let paused = false;

      container.addEventListener('mouseenter', () => (paused = true));
      container.addEventListener('mouseleave', () => (paused = false));
      container.addEventListener('focusin', () => (paused = true));
      container.addEventListener('focusout', () => (paused = false));

      function step(ts) {
        const dt = Math.min(60, ts - lastTs) / 1000;
        lastTs = ts;
        if (!paused) {
          pos += (reverse ? -1 : 1) * speed * dt;
          if (pos > contentWidth) pos -= contentWidth;
          if (pos < 0) pos += contentWidth;
          inner.style.transform = `translateX(${-pos}px)`;
          innerClone.style.transform = `translateX(${-pos}px)`;
        }
        requestAnimationFrame(step);
      }

      window.addEventListener('resize', () => { contentWidth = getContentWidth(); });
      requestAnimationFrame(step);
    }

    createMarquee('.featured-scroller', 36);
    createMarquee('.partners-row', 28);

    // Updated: make testimonials flow like partners (uses .testi-scroller)
    (function enableTestiMarquee() {
      const testi = document.querySelector('.testi-scroller');
      if (!testi) return;

      // only enable marquee on wider screens to preserve mobile stacking
      // if (window.innerWidth <= 720) return;

      // apply marquee with a comfortable speed
      createMarquee('.testi-scroller', 24);
    })();
  })();
})(); // end main IIFE


/* -------------------------------------------
   Placeholder rotation IIFE (inserted/updated)
   - Reads placeholders from:
       1) window.FOOD_PLACEHOLDERS (preferred)
       2) document.body.dataset.placeholders (JSON string) fallback
       3) a small safe default
   - Rotates images with class "placeholder-rotating" every 3000ms with fade.
-------------------------------------------- */
(function setupPlaceholderRotation() {
  // helper: get pool from multiple locations
  function readPool() {
    try {
      if (Array.isArray(window.FOOD_PLACEHOLDERS) && window.FOOD_PLACEHOLDERS.length) {
        return window.FOOD_PLACEHOLDERS.slice();
      }
      if (document.body && document.body.dataset && document.body.dataset.placeholders) {
        const parsed = JSON.parse(document.body.dataset.placeholders);
        if (Array.isArray(parsed) && parsed.length) return parsed.slice();
      }
    } catch (e) {
      console.warn('Could not parse placeholder list', e);
    }
    // safe default (keep small set)
    return [
      '/images/food/placeholder.jpg',
      '/images/food/moi_moi.jpg',
      '/images/food/beans_ewa_riro.jpg',
      '/images/food/jollof.jpg'
    ];
  }

  const pool = readPool();
  if (!pool || !pool.length) return;

  // canonical placeholder (optional): read from window or dataset
  let CANONICAL_PLACEHOLDER = (typeof window.CANONICAL_PLACEHOLDER !== 'undefined') ? window.CANONICAL_PLACEHOLDER : null;
  if (!CANONICAL_PLACEHOLDER && document.body && document.body.dataset && document.body.dataset.canonicalPlaceholder) {
    CANONICAL_PLACEHOLDER = document.body.dataset.canonicalPlaceholder;
  }

  // preload pool images
  const preloaded = [];
  pool.forEach((src) => {
    try {
      const img = new Image();
      img.src = src;
      preloaded.push(img);
    } catch (e) {
      // ignore
    }
  });

  function getRotatingElements() {
    return Array.from(document.querySelectorAll('img.placeholder-rotating'));
  }

  // compare absolute urls to avoid relative path mismatch
  function absUrl(src) {
    try {
      return new URL(src, location.origin).href;
    } catch (e) {
      return src;
    }
  }

  // initialize per-element index (randomize)
  function ensureIndexes() {
    getRotatingElements().forEach((el) => {
      if (el.dataset.rotateIndex == null) {
        el.dataset.rotateIndex = Math.floor(Math.random() * pool.length);
      }
    });
  }

  // next index: sequential but avoid same if possible
  function nextIndex(curr) {
    if (pool.length <= 1) return curr;
    let next = (Number(curr) + 1) % pool.length;
    if (next === Number(curr)) next = (Number(curr) + 1) % pool.length;
    return next;
  }

  // optional: pick a random different index (if you prefer random)
  function randomDifferent(curr) {
    if (pool.length <= 1) return curr;
    let next = Math.floor(Math.random() * pool.length);
    let attempts = 0;
    while (next === Number(curr) && attempts < 6) {
      next = Math.floor(Math.random() * pool.length);
      attempts++;
    }
    return next;
  }

  // check if element already showing target
  function isShowing(el, targetSrc) {
    try {
      const current = el.src || el.getAttribute('src') || '';
      return absUrl(current) === absUrl(targetSrc);
    } catch (e) {
      return false;
    }
  }

  // perform swap with smooth fade
  async function swapElement(el, nextIdx) {
    try {
      const targetSrc = pool[nextIdx];
      if (!targetSrc) return;

      if (isShowing(el, targetSrc)) {
        el.dataset.rotateIndex = nextIdx;
        return;
      }

      // fade-out
      el.classList.add('fade-out');

      // wait slightly more than CSS transition (CSS should set ~360ms)
      await new Promise((r) => setTimeout(r, 420));

      // set new src (use dataset to avoid flicker on slow networks)
      el.src = targetSrc;
      el.dataset.rotateIndex = nextIdx;

      // allow browser to update then fade-in
      requestAnimationFrame(() => el.classList.remove('fade-out'));
    } catch (e) {
      console.error('swapElement error', e);
    }
  }

  // tick: rotate elements
  function tick() {
    ensureIndexes();
    const els = getRotatingElements();
    if (!els.length) return;

    els.forEach((el) => {
      const curr = (typeof el.dataset.rotateIndex !== 'undefined') ? Number(el.dataset.rotateIndex) : Math.floor(Math.random() * pool.length);
      // choose strategy: sequential (nextIndex) OR random (randomDifferent)
      const nidx = nextIndex(curr); // keep sequential for predictable rotations
      // const nidx = randomDifferent(curr); // uncomment to use random instead
      swapElement(el, nidx);
    });
  }

  // ensure DOM ready then start
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      ensureIndexes();
      // initial tiny delay then start
      setTimeout(() => { tick(); setInterval(tick, 3000); }, 600);
    });
  } else {
    ensureIndexes();
    setTimeout(() => { tick(); setInterval(tick, 3000); }, 600);
  }
})();

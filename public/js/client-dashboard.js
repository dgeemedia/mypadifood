// public/js/client-dashboard.js
(function () {
  'use strict';

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $all(sel, ctx) { return Array.from((ctx || document).querySelectorAll(sel)); }

  const navButtons = $all('.nav-item');
  const sections = $all('.app-section');

  // Hide flash / alert elements that may persist across sections.
  // Targets common patterns used in your templates: .flash, .flash-messages, .alert, .form-errors, #flash, [role="status"]
  function hideFlash() {
    try {
      $all('.flash, .flash-messages, .form-errors, #flash, .alert, .alert-success, .alert-danger, .flash-success, .flash-error').forEach(el => {
        // prefer removing child alerts inside wrapper containers
        if (el.classList && el.classList.contains('flash-messages') && el.children.length) {
          Array.from(el.children).forEach(child => {
            if (child && child.remove) child.remove();
          });
          if (!el.children.length) el.remove();
        } else {
          // remove element entirely so it doesn't persist in DOM
          if (el && el.remove) el.remove();
          else el.style.display = 'none';
        }
      });

      // any other transient status regions e.g. role=status or aria-live containers
      $all('[role="status"], [aria-live]').forEach(el => {
        if (el && el.textContent && el.textContent.trim()) {
          el.textContent = '';
          el.style.display = 'none';
        }
      });
    } catch (e) {
      console.warn('hideFlash error', e);
    }
  }

  function showTarget(id, opts = {}) {
    // Toggle visibility
    sections.forEach(s => s.classList.toggle('app-section-hidden', s.id !== id));
    // Update aria-current on nav buttons
    navButtons.forEach(btn => btn.setAttribute('aria-current', btn.dataset.target === id ? 'true' : 'false'));
    // Update document title (keep base)
    const labelEl = document.querySelector(`.nav-item[data-target="${id}"] .nav-label`);
    const label = labelEl ? labelEl.textContent : null;
    if (label) document.title = `${label} — Dashboard`;

    // Hide any flash messages when user navigates away
    hideFlash();

    // Update history if requested
    if (opts.push !== false) {
      const url = new URL(location.href);
      url.hash = id;
      try {
        history.pushState({ section: id }, '', url);
      } catch (e) {
        // fallback: set hash
        location.hash = id;
      }
    }

    // move focus to first focusable element inside the shown section for accessibility
    const section = document.getElementById(id);
    if (section) {
      const focusable = section.querySelector('a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (focusable) focusable.focus({ preventScroll: true });
    }
  }

  // Attach click handlers
  navButtons.forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault();
      const target = btn.dataset.target;
      if (!target) return;
      showTarget(target, { push: true });
    });
    // keyboard activation (Enter or Space)
    btn.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        btn.click();
      }
    });
  });

  // Also hide flash if user clicks anywhere on nav (covers cases where nav uses links)
  document.addEventListener('click', (e) => {
    const ancestor = e.target.closest && e.target.closest('.app-nav');
    if (ancestor) {
      // user clicked the nav area — hide flashes immediately (but let the nav click handler handle showTarget)
      hideFlash();
    }
  });

  // Handle popstate (back/forward)
  window.addEventListener('popstate', e => {
    // Prefer state.section, fallback to hash
    const id = (e.state && e.state.section) || (location.hash ? location.hash.replace('#','') : null) || 'section-account';
    if (document.getElementById(id)) {
      showTarget(id, { push: false });
    }
  });

  // On load: determine initial section (state -> hash -> default)
  document.addEventListener('DOMContentLoaded', () => {
    const initial = (history.state && history.state.section) || (location.hash ? location.hash.replace('#','') : 'section-account');

    if (document.getElementById(initial)) {
      showTarget(initial, { push: false });
    } else {
      showTarget('section-account', { push: false });
    }

    // If server flagged a recent order (booking just created), open Orders & focus/open its chat button.
    // We only override the default account landing when the page would otherwise land on the default 'section-account'.
    if (window.ORDER_ID && (initial === 'section-account' || initial === null)) {
      if (document.getElementById('section-orders')) {
        // show orders section (do not push a new history entry)
        showTarget('section-orders', { push: false });
      }

      // Try to focus / open the chat for that order after a short tick so other listeners have attached.
      const tryOpenChat = () => {
        const chatBtn = document.querySelector(`.btn-view-chat[data-order-id="${window.ORDER_ID}"]`);
        if (chatBtn) {
          try {
            // Focus first for accessibility
            chatBtn.focus({ preventScroll: true });
            // If you want the chat modal opened automatically, uncomment the next line.
            // setTimeout(() => chatBtn.click(), 60);
          } catch (e) {
            // ignore focus errors
          }
        } else {
          // If the button isn't present yet (e.g. slow render), retry a couple times
          let retries = 0;
          const id = setInterval(() => {
            retries++;
            const btn = document.querySelector(`.btn-view-chat[data-order-id="${window.ORDER_ID}"]`);
            if (btn) {
              try {
                btn.focus({ preventScroll: true });
                // setTimeout(() => btn.click(), 60); // auto-open if desired
              } catch (e) {}
              clearInterval(id);
            } else if (retries > 10) {
              clearInterval(id);
            }
          }, 80);
        }
      };

      // run on next tick
      setTimeout(tryOpenChat, 40);
    }

        // If server flagged a recent weekly plan, open Weekly Plan & focus the plan's View link.
    if (window.WEEKLY_PLAN_ID && (initial === 'section-account' || initial === null)) {
      if (document.getElementById('section-weekly')) {
        showTarget('section-weekly', { push: false });
      }

      const tryOpenWeekly = () => {
        // try to find the View URL anchor for that plan (anchors are: /client/special-order/<id>)
        const selector = `a[href$="/client/special-order/${window.WEEKLY_PLAN_ID}"], a[href*="/client/special-order/${window.WEEKLY_PLAN_ID}"]`;
        const viewLink = document.querySelector(selector);

        if (viewLink) {
          try {
            viewLink.focus({ preventScroll: true });
            // If you want to auto-open the view page in the same tab, uncomment:
            // setTimeout(() => { viewLink.click(); }, 60);
          } catch (e) {}
        } else {
          // fallback: focus create button in weekly section
          const createBtn = document.querySelector('#section-weekly a.btn, #section-weekly button.btn');
          if (createBtn) createBtn.focus({ preventScroll: true });

          // retry a few times in case rows render late
          let retries = 0;
          const id = setInterval(() => {
            retries++;
            const btn = document.querySelector(selector);
            if (btn) {
              try { btn.focus({ preventScroll: true }); } catch (e) {}
              clearInterval(id);
            } else if (retries > 10) {
              clearInterval(id);
            }
          }, 80);
        }
      };

      setTimeout(tryOpenWeekly, 40);
    }

    // Optional: support deep-link by listening for hashchange if some code sets hash directly
    window.addEventListener('hashchange', () => {
      const id = location.hash.replace('#','');
      if (document.getElementById(id)) showTarget(id, { push: false });
    });
  });
})();

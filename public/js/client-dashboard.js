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
        if (el.classList && el.classList.contains('flash-messages') && el.children.length) {
          Array.from(el.children).forEach(child => { if (child && child.remove) child.remove(); });
          if (!el.children.length) el.remove();
        } else {
          if (el && el.remove) el.remove(); else if (el) el.style.display = 'none';
        }
      });

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
    sections.forEach(s => s.classList.toggle('app-section-hidden', s.id !== id));
    navButtons.forEach(btn => btn.setAttribute('aria-current', btn.dataset.target === id ? 'true' : 'false'));
    const labelEl = document.querySelector(`.nav-item[data-target="${id}"] .nav-label`);
    const label = labelEl ? labelEl.textContent : null;
    if (label) document.title = `${label} — Dashboard`;

    hideFlash();

    if (opts.push !== false) {
      const url = new URL(location.href);
      url.hash = id;
      try {
        history.pushState({ section: id }, '', url);
      } catch (e) {
        location.hash = id;
      }
    }

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
    btn.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        btn.click();
      }
    });
  });

  // Also hide flash if user clicks anywhere on nav
  document.addEventListener('click', (e) => {
    const ancestor = e.target.closest && e.target.closest('.app-nav');
    if (ancestor) hideFlash();
  });

  // Handle popstate (back/forward)
  window.addEventListener('popstate', e => {
    const id = (e.state && e.state.section) || (location.hash ? location.hash.replace('#','') : null) || 'section-account';
    if (document.getElementById(id)) showTarget(id, { push: false });
  });

  /* ----------------------------
     State / LGA datalist autocomplete
     expects /locations/Nigeria-State-Lga.json to be served
     supports formats:
       - [{ state: "Lagos", lgas: ["Ikeja", ...] }, ...]
       - { "Lagos": ["Ikeja", ...], ... }
     ---------------------------- */
  function initStateLgaAutocomplete() {
    const STATES_URL = '/locations/Nigeria-State-Lga.json';
    const stateInput = document.getElementById('vendor-search-state');
    const lgaInput = document.getElementById('vendor-search-lga');
    const statesDatalist = document.getElementById('states-datalist');
    const lgasDatalist = document.getElementById('lgas-datalist');

    if (!statesDatalist || !lgasDatalist || !stateInput) return;

    fetch(STATES_URL, { cache: 'force-cache' })
      .then(res => {
        if (!res.ok) throw new Error('Could not load states/LGAs');
        return res.json();
      })
      .then(data => {
        const lookup = {};
        const stateNames = [];

        if (Array.isArray(data)) {
          data.forEach(item => {
            const s = item.state || item.name || null;
            const lgas = Array.isArray(item.lgas) ? item.lgas : item.lga || [];
            if (s) {
              lookup[s] = lgas;
              stateNames.push(s);
            }
          });
        } else if (typeof data === 'object' && data !== null) {
          Object.keys(data).forEach(k => {
            lookup[k] = Array.isArray(data[k]) ? data[k] : [];
            stateNames.push(k);
          });
        }

        statesDatalist.innerHTML = stateNames.map(s => `<option value="${s}"></option>`).join('');

        const initialState = stateInput.value && stateInput.value.trim();
        if (initialState && lookup[initialState]) {
          lgasDatalist.innerHTML = lookup[initialState].map(l => `<option value="${l}"></option>`).join('');
        }

        stateInput.addEventListener('input', () => {
          const s = stateInput.value && stateInput.value.trim();
          const lgas = s && lookup[s] ? lookup[s] : [];
          lgasDatalist.innerHTML = lgas.map(l => `<option value="${l}"></option>`).join('');
          if (lgaInput && lgaInput.value && lgas.indexOf(lgaInput.value) === -1) {
            lgaInput.value = '';
          }
        });
      })
      .catch(err => {
        console.warn('State/LGA autocomplete unavailable:', err);
      });
  }

  // wire clear button for vendor search (place inside the IIFE, and will be called from DOMContentLoaded)
  function wireVendorClear() {
    const clearBtn = document.getElementById('vendor-search-clear');
    const form = document.querySelector('.vendor-search-form');
    if (!clearBtn || !form) return;

    clearBtn.addEventListener('click', (e) => {
      e.preventDefault();

      // Clear the named inputs
      form.querySelectorAll('input[name="q"], input[name="state"], input[name="lga"]').forEach(i => {
        i.value = '';
        // fire input event so datalist/LGA logic can react and clear dependent lists
        try { i.dispatchEvent(new Event('input', { bubbles: true })); } catch (err) {}
      });

      // Ensure we land on the vendors tab after reload
      // Put the hash into the action so the browser navigates to /client/dashboard#section-vendors
      form.action = '/client/dashboard#section-vendors';

      // submit the cleared form to reload results (default: shows vendors near user)
      form.submit();
    });
  }

  // On load: determine initial section (state -> hash -> default)
  document.addEventListener('DOMContentLoaded', () => {
    // initialize autocomplete (non-blocking)
    try { initStateLgaAutocomplete(); } catch (e) { console.warn('initStateLgaAutocomplete failed', e); }

    // wire clear button
    try { wireVendorClear(); } catch (e) { console.warn('wireVendorClear failed', e); }

    const initial = (history.state && history.state.section) || (location.hash ? location.hash.replace('#','') : 'section-account');

    // If the URL contains search params for vendors, prefer showing vendors (fixes landing on Account after search)
    const urlParams = new URLSearchParams(location.search);
    const hasVendorSearch = urlParams.has('q') || urlParams.has('state') || urlParams.has('lga');

    // helper: decide which panel to open on load.
    // Priority (highest -> lowest):
    // 1. explicit hash (handled earlier by initial variable)
    // 2. ORDER_ID (open orders)
    // 3. WEEKLY_PLAN_ID (open weekly)
    // 4. WALLET_TX_ID (open wallet)
    // 5. vendor search params present (open vendors)
    // 6. fallback to initial (usually account)
    let finalPanel = initial;

    // If history/hash pointed to account but we have a higher-priority server flag, honor it
    if ((initial === 'section-account' || initial === null)) {
      if (window.ORDER_ID) finalPanel = 'section-orders';
      else if (window.WEEKLY_PLAN_ID) finalPanel = 'section-weekly';
      else if (window.WALLET_TX_ID) finalPanel = 'section-wallet';
      else if (hasVendorSearch) finalPanel = 'section-vendors';
    } else {
      // if hash explicitly points to a panel, keep it (finalPanel already set)
      // special-case: if hash is 'section-account' but search params indicate vendors, prefer vendors
      if ((initial === 'section-account') && hasVendorSearch) finalPanel = 'section-vendors';
    }

    // finally, show the decided panel
    if (document.getElementById(finalPanel)) {
      showTarget(finalPanel, { push: false });
    } else {
      showTarget('section-account', { push: false });
    }

    // If server flagged a recent order open Orders & focus/open its chat button.
    if (window.ORDER_ID && (finalPanel === 'section-orders' || finalPanel === 'section-account' || finalPanel === null)) {
      if (document.getElementById('section-orders')) showTarget('section-orders', { push: false });

      const tryOpenChat = () => {
        const chatBtn = document.querySelector(`.btn-view-chat[data-order-id="${window.ORDER_ID}"]`);
        if (chatBtn) {
          try { chatBtn.focus({ preventScroll: true }); /* setTimeout(() => chatBtn.click(), 60); */ } catch (e) {}
        } else {
          let retries = 0;
          const id = setInterval(() => {
            retries++;
            const btn = document.querySelector(`.btn-view-chat[data-order-id="${window.ORDER_ID}"]`);
            if (btn) { try { btn.focus({ preventScroll: true }); } catch (e) {} clearInterval(id); }
            else if (retries > 10) clearInterval(id);
          }, 80);
        }
      };
      setTimeout(tryOpenChat, 40);
    }

    // If server flagged a recent weekly plan, open Weekly Plan & focus the plan's View link.
    if (window.WEEKLY_PLAN_ID && (finalPanel === 'section-weekly' || finalPanel === 'section-account' || finalPanel === null)) {
      if (document.getElementById('section-weekly')) showTarget('section-weekly', { push: false });

      const tryOpenWeekly = () => {
        const selector = `a[href$="/client/special-order/${window.WEEKLY_PLAN_ID}"], a[href*="/client/special-order/${window.WEEKLY_PLAN_ID}"]`;
        const viewLink = document.querySelector(selector);
        if (viewLink) {
          try { viewLink.focus({ preventScroll: true }); /* setTimeout(() => { viewLink.click(); }, 60); */ } catch (e) {}
        } else {
          const createBtn = document.querySelector('#section-weekly a.btn, #section-weekly button.btn');
          if (createBtn) createBtn.focus({ preventScroll: true });
          let retries = 0;
          const id = setInterval(() => {
            retries++;
            const btn = document.querySelector(selector);
            if (btn) { try { btn.focus({ preventScroll: true }); } catch (e) {} clearInterval(id); }
            else if (retries > 10) clearInterval(id);
          }, 80);
        }
      };
      setTimeout(tryOpenWeekly, 40);
    }

    // If server flagged a wallet top-up transaction, open Wallet section & focus balance or top-up form.
    if (window.WALLET_TX_ID && (finalPanel === 'section-wallet' || finalPanel === 'section-account' || finalPanel === null)) {
      if (document.getElementById('section-wallet')) showTarget('section-wallet', { push: false });

      const tryFocusWallet = () => {
        // prefer focusing balance element, then top-up input, then withdraw button
        const candidates = [
          document.getElementById('wallet-balance'),
          document.querySelector('#section-wallet input[name="amount"], #section-wallet input[type="number"]'),
          document.querySelector('#section-wallet button, #section-wallet a.btn')
        ];
        for (const el of candidates) {
          if (el) {
            try { el.focus({ preventScroll: true }); } catch (e) {}
            return;
          }
        }

        // retry logic in case DOM renders late
        let retries = 0;
        const id = setInterval(() => {
          retries++;
          const el = document.getElementById('wallet-balance') || document.querySelector('#section-wallet input[name="amount"], #section-wallet input[type="number"]') || document.querySelector('#section-wallet button, #section-wallet a.btn');
          if (el) {
            try { el.focus({ preventScroll: true }); } catch (e) {}
            clearInterval(id);
          } else if (retries > 12) {
            clearInterval(id);
          }
        }, 80);
      };

      setTimeout(tryFocusWallet, 40);
    }

    // reveal the UI once JS has selected the correct panel (prevents FOUC)
    document.documentElement.classList.add('js-ready');

    // Hash change support
    window.addEventListener('hashchange', () => {
      const id = location.hash.replace('#','');
      if (document.getElementById(id)) showTarget(id, { push: false });
    });
  });
})();

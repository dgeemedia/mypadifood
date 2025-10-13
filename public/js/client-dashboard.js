//public/js/client-dashboard.js
(function () {
  'use strict';

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $all(sel, ctx) { return Array.from((ctx || document).querySelectorAll(sel)); }

  const navButtons = $all('.nav-item');
  const sections = $all('.app-section');

  // Hide flash / alert elements that may persist across sections.
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

  /* ----------------------------
     Helper: show an inner edit panel inside section-account-edit
     - shows the parent section, reveals the correct inner panel,
       focuses first input, and initializes account forms.
     ---------------------------- */
  function showInnerPanel(innerId, opts = {}) {
    const wrapper = document.getElementById('section-account-edit');
    if (!wrapper) return;

    // show the wrapper (don't push -- we'll handle state below)
    showTarget('section-account-edit', { push: opts.push !== false });

    // hide all edit panels
    document.querySelectorAll('#edit-panels .edit-panel').forEach(p => {
      p.style.display = 'none';
      p.setAttribute('aria-hidden', 'true');
    });

    const inner = document.getElementById(innerId);
    if (!inner) return;

    inner.style.display = '';
    inner.setAttribute('aria-hidden', 'false');

    // focus first meaningful input/button
    const focusEl = inner.querySelector('input:not([type="hidden"]), select, textarea, button');
    if (focusEl) {
      try { focusEl.focus({ preventScroll: true }); } catch (e) {}
    }

    // initialize account form handlers if available (for AJAX-loaded panels or to re-bind)
    if (window.initAccountFormHandlers && typeof window.initAccountFormHandlers === 'function') {
      try { window.initAccountFormHandlers(); } catch (e) { console.warn('initAccountFormHandlers failed', e); }
    }

    // --- ensure state options exist and populate LGAs for the revealed inner panel ---
    try {
      // helper: get pooled states data from location-picker loaded sources
      const getStatesData = () => {
        // prefer the location-picker's cached data
        if (window.__LOCATION_PICKER_STATES && Array.isArray(window.__LOCATION_PICKER_STATES) && window.__LOCATION_PICKER_STATES.length) {
          return window.__LOCATION_PICKER_STATES;
        }
        // then window.STATE_DATA
        if (Array.isArray(window.STATE_DATA) && window.STATE_DATA.length) return window.STATE_DATA;
        // then try to parse #states-data dataset if present
        const sd = document.getElementById('states-data');
        if (sd && sd.dataset && sd.dataset.states) {
          try { return JSON.parse(sd.dataset.states); } catch (e) { /* ignore */ }
        }
        // nothing available synchronously
        return null;
      };

      const statesData = getStatesData();

      // find state selects inside this inner panel (address partial uses #client-state)
      const stateSelects = Array.from(inner.querySelectorAll('select#client-state, select[name="state"]'));

      // If we have statesData synchronously and the state select has only the placeholder, fill it
      if (statesData && statesData.length) {
        stateSelects.forEach(s => {
          // if server didn't render options (only 1 placeholder option), populate client-side
          if (!s.options || s.options.length <= 1) {
            s.innerHTML = '<option value="">Select state</option>';
            statesData.forEach(st => {
              const name = st.state || st.name || st;
              const opt = document.createElement('option');
              opt.value = name;
              opt.textContent = name;
              s.appendChild(opt);
            });
            // restore previously selected value (if any)
            const cur = (typeof currentUser !== 'undefined' && currentUser && currentUser.state) ? String(currentUser.state).trim() : '';
            if (cur) {
              const found = Array.from(s.options).some(o => String(o.value).trim().toLowerCase() === cur.toLowerCase());
              if (found) s.value = cur;
            }
          }
          // after ensuring options, populate LGAs for this select using location-picker helpers if available
          if (window.populateLgasForSelect && typeof window.populateLgasForSelect === 'function') {
            try { window.populateLgasForSelect(s); } catch (e) { console.warn('populateLgasForSelect failed', e); }
          } else {
            // fallback: if location-picker not present, attempt to trigger a change event so other logic may handle it
            try { s.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) {}
          }
        });
      } else {
        // no sync states data — try to initialize the location picker (async); it will populate selects
        if (window.initLocationPicker && typeof window.initLocationPicker === 'function') {
          window.initLocationPicker().then(() => {
            const sList = Array.from(inner.querySelectorAll('select#client-state, select[name="state"]'));
            sList.forEach(s => {
              if (window.populateLgasForSelect && typeof window.populateLgasForSelect === 'function') {
                try { window.populateLgasForSelect(s); } catch (e) { console.warn('populateLgasForSelect after init failed', e); }
              } else {
                try { s.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) {}
              }
            });
          }).catch(e => console.warn('initLocationPicker failed', e));
        }
      }
    } catch (e) {
      console.warn('Address panel population failed', e);
    }

    // Update history/state so back/forward works.
    // store the sub-panel in state but use a stable hash (we'll set hash to innerId for readability)
    try {
      history.pushState({ section: 'section-account-edit', sub: innerId }, '', `#${innerId}`);
    } catch (e) {
      location.hash = innerId;
    }
  }

  // Attach click handlers to main nav buttons (top-level)
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

  // wire account edit toggles (account-menu buttons, subnavs, any data-target attributes that reference account sections)
  function wireAccountEditToggles() {
    // select anything that will toggle account edit areas:
    // - .account-edit-toggle (account menu)
    // - .subnav-item (subnav inside edit wrapper)
    // - any element with data-target that starts with "section-account"
    document.querySelectorAll('.account-edit-toggle, .subnav-item, [data-target^="section-account"]').forEach(btn => {
      // avoid double-binding
      if (btn.__acctToggleBound) return;
      btn.__acctToggleBound = true;

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const target = btn.dataset.target;
        if (!target) return;

        // If this is an inner-edit panel (e.g. section-account-edit-phone)
        if (target.startsWith('section-account-edit')) {
          showInnerPanel(target);
          return;
        }

        // Otherwise, it's a top-level section (return to dashboard, etc.)
        showTarget(target, { push: true });
      });

      // keyboard activate
      btn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          btn.click();
        }
      });
    });
  }

  // Also hide flash if user clicks anywhere on nav
  document.addEventListener('click', (e) => {
    const ancestor = e.target.closest && e.target.closest('.app-nav');
    if (ancestor) hideFlash();
  });

  // Handle popstate (back/forward) — support inner sub-panel restore
  window.addEventListener('popstate', e => {
    const state = e.state || {};
    // If state explicitly points to an edit sub-panel, restore it
    if (state.section === 'section-account-edit' && state.sub) {
      // show parent without pushing history
      showInnerPanel(state.sub, { push: false });
      return;
    }

    // fallback: if state.section is a top-level panel, show it
    const id = state.section || (location.hash ? location.hash.replace('#','') : null) || 'section-account';
    if (document.getElementById(id)) {
      showTarget(id, { push: false });
      return;
    }

    // if hash looks like an inner panel id (e.g. #section-account-edit-phone), handle it
    const hash = location.hash ? location.hash.replace('#','') : null;
    if (hash && hash.startsWith('section-account-edit')) {
      showInnerPanel(hash, { push: false });
      return;
    }

    // final fallback
    if (document.getElementById('section-account')) showTarget('section-account', { push: false });
  });

  /* ----------------------------
     State / LGA datalist autocomplete
     ... (unchanged)
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

  function wireVendorClear() {
    const clearBtn = document.getElementById('vendor-search-clear');
    const form = document.querySelector('.vendor-search-form');
    if (!clearBtn || !form) return;

    clearBtn.addEventListener('click', (e) => {
      e.preventDefault();

      form.querySelectorAll('input[name="q"], input[name="state"], input[name="lga"]').forEach(i => {
        i.value = '';
        try { i.dispatchEvent(new Event('input', { bubbles: true })); } catch (err) {}
      });

      form.action = '/client/dashboard#section-vendors';
      form.submit();
    });
  }

  // On load: determine initial section (state -> hash -> default)
  document.addEventListener('DOMContentLoaded', () => {
    try { initStateLgaAutocomplete(); } catch (e) { console.warn('initStateLgaAutocomplete failed', e); }
    try { wireVendorClear(); } catch (e) { console.warn('wireVendorClear failed', e); }

    // wire account edit toggles AFTER DOM ready
    try { wireAccountEditToggles(); } catch (e) { console.warn('wireAccountEditToggles failed', e); }

    const initial = (history.state && history.state.section) || (location.hash ? location.hash.replace('#','') : 'section-account');

    const urlParams = new URLSearchParams(location.search);
    const hasVendorSearch = urlParams.has('q') || urlParams.has('state') || urlParams.has('lga');

    let finalPanel = initial;

    if ((initial === 'section-account' || initial === null)) {
      if (window.ORDER_ID) finalPanel = 'section-orders';
      else if (window.WEEKLY_PLAN_ID) finalPanel = 'section-weekly';
      else if (window.WALLET_TX_ID) finalPanel = 'section-wallet';
      else if (hasVendorSearch) finalPanel = 'section-vendors';
    } else {
      if ((initial === 'section-account') && hasVendorSearch) finalPanel = 'section-vendors';
    }

    // If hash is an inner panel (e.g. #section-account-edit-phone) prefer showing it.
    const hash = location.hash ? location.hash.replace('#','') : null;
    if (hash && hash.startsWith('section-account-edit')) {
      if (document.getElementById(hash)) {
        showInnerPanel(hash, { push: false });
      } else {
        showTarget(finalPanel, { push: false });
      }
    } else if (document.getElementById(finalPanel)) {
      showTarget(finalPanel, { push: false });
    } else {
      showTarget('section-account', { push: false });
    }

    // existing server-flag handlers (orders, weekly plans, wallet) remain unchanged...
    if (window.ORDER_ID && (finalPanel === 'section-orders' || finalPanel === 'section-account' || finalPanel === null)) {
      if (document.getElementById('section-orders')) showTarget('section-orders', { push: false });

      const tryOpenChat = () => {
        const chatBtn = document.querySelector(`.btn-view-chat[data-order-id="${window.ORDER_ID}"]`);
        if (chatBtn) {
          try { chatBtn.focus({ preventScroll: true }); } catch (e) {}
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

    if (window.WEEKLY_PLAN_ID && (finalPanel === 'section-weekly' || finalPanel === 'section-account' || finalPanel === null)) {
      if (document.getElementById('section-weekly')) showTarget('section-weekly', { push: false });

      const tryOpenWeekly = () => {
        const selector = `a[href$="/client/special-order/${window.WEEKLY_PLAN_ID}"], a[href*="/client/special-order/${window.WEEKLY_PLAN_ID}"]`;
        const viewLink = document.querySelector(selector);
        if (viewLink) {
          try { viewLink.focus({ preventScroll: true }); } catch (e) {}
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

    if (window.WALLET_TX_ID && (finalPanel === 'section-wallet' || finalPanel === 'section-account' || finalPanel === null)) {
      if (document.getElementById('section-wallet')) showTarget('section-wallet', { push: false });

      const tryFocusWallet = () => {
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

    document.documentElement.classList.add('js-ready');

    // Hash change support (handle inner-panel hashes too)
    window.addEventListener('hashchange', () => {
      const id = location.hash.replace('#','');
      if (!id) return;
      if (id.startsWith('section-account-edit') && document.getElementById(id)) {
        showInnerPanel(id, { push: false });
      } else if (document.getElementById(id)) {
        showTarget(id, { push: false });
      }
    });
  });
})();

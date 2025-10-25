// public/js/client-dashboard.js
// Full dashboard behavior + vendorId auto-open (combined)
// Replaces/updates the previous file — drop in place of the old one.

(function () {
  'use strict';

  /* ---------------------------
     Mini DOM helpers
     --------------------------- */
  function $(sel, ctx) {
    return (ctx || document).querySelector(sel);
  }
  function $all(sel, ctx) {
    return Array.from((ctx || document).querySelectorAll(sel));
  }

  const navButtons = $all('.nav-item');
  const sections = $all('.app-section');

  /* ---------------------------
     Flash hide helper
     --------------------------- */
  function hideFlash() {
    try {
      $all(
        '.flash, .flash-messages, .form-errors, #flash, .alert, .alert-success, .alert-danger, .flash-success, .flash-error'
      ).forEach((el) => {
        if (
          el.classList &&
          el.classList.contains('flash-messages') &&
          el.children.length
        ) {
          Array.from(el.children).forEach((child) => {
            if (child && child.remove) child.remove();
          });
          if (!el.children.length) el.remove();
        } else {
          if (el && el.remove) el.remove();
          else if (el) el.style.display = 'none';
        }
      });

      $all('[role="status"], [aria-live]').forEach((el) => {
        if (el && el.textContent && el.textContent.trim()) {
          el.textContent = '';
          el.style.display = 'none';
        }
      });
    } catch (e) {
      console.warn('hideFlash error', e);
    }
  }

  /* ---------------------------
     Section management
     --------------------------- */
  function showTarget(id, opts = {}) {
    sections.forEach((s) =>
      s.classList.toggle('app-section-hidden', s.id !== id)
    );
    navButtons.forEach((btn) =>
      btn.setAttribute(
        'aria-current',
        btn.dataset.target === id ? 'true' : 'false'
      )
    );
    const labelEl = document.querySelector(
      `.nav-item[data-target="${id}"] .nav-label`
    );
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
      const focusable = section.querySelector(
        'a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable) focusable.focus({ preventScroll: true });
    }
  }

  /* ---------------------------
     Show inner edit panel
     --------------------------- */
  function showInnerPanel(innerId, opts = {}) {
    const wrapper = document.getElementById('section-account-edit');
    if (!wrapper) return;

    showTarget('section-account-edit', { push: opts.push !== false });

    document.querySelectorAll('#edit-panels .edit-panel').forEach((p) => {
      p.style.display = 'none';
      p.setAttribute('aria-hidden', 'true');
    });

    const inner = document.getElementById(innerId);
    if (!inner) return;

    inner.style.display = '';
    inner.setAttribute('aria-hidden', 'false');

    const focusEl = inner.querySelector(
      'input:not([type="hidden"]), select, textarea, button'
    );
    if (focusEl) {
      try {
        focusEl.focus({ preventScroll: true });
      } catch (e) {}
    }

    if (
      window.initAccountFormHandlers &&
      typeof window.initAccountFormHandlers === 'function'
    ) {
      try {
        window.initAccountFormHandlers();
      } catch (e) {
        console.warn('initAccountFormHandlers failed', e);
      }
    }

    // Populate states/LGAs when panels reveal, try to reuse available helpers/data
    try {
      const getStatesData = () => {
        if (
          window.__LOCATION_PICKER_STATES &&
          Array.isArray(window.__LOCATION_PICKER_STATES) &&
          window.__LOCATION_PICKER_STATES.length
        ) {
          return window.__LOCATION_PICKER_STATES;
        }
        if (Array.isArray(window.STATE_DATA) && window.STATE_DATA.length)
          return window.STATE_DATA;
        const sd = document.getElementById('states-data');
        if (sd && sd.dataset && sd.dataset.states) {
          try {
            return JSON.parse(sd.dataset.states);
          } catch (e) {
            /* ignore */
          }
        }
        return null;
      };

      const statesData = getStatesData();

      const stateSelects = Array.from(
        inner.querySelectorAll('select#client-state, select[name="state"]')
      );

      if (statesData && statesData.length) {
        stateSelects.forEach((s) => {
          if (!s.options || s.options.length <= 1) {
            s.innerHTML = '<option value="">Select state</option>';
            statesData.forEach((st) => {
              const name = st.state || st.name || st;
              const opt = document.createElement('option');
              opt.value = name;
              opt.textContent = name;
              s.appendChild(opt);
            });
            const cur =
              typeof currentUser !== 'undefined' &&
              currentUser &&
              currentUser.state
                ? String(currentUser.state).trim()
                : '';
            if (cur) {
              const found = Array.from(s.options).some(
                (o) =>
                  String(o.value).trim().toLowerCase() === cur.toLowerCase()
              );
              if (found) s.value = cur;
            }
          }
          if (
            window.populateLgasForSelect &&
            typeof window.populateLgasForSelect === 'function'
          ) {
            try {
              window.populateLgasForSelect(s);
            } catch (e) {
              console.warn('populateLgasForSelect failed', e);
            }
          } else {
            try {
              s.dispatchEvent(new Event('change', { bubbles: true }));
            } catch (e) {}
          }
        });
      } else {
        if (
          window.initLocationPicker &&
          typeof window.initLocationPicker === 'function'
        ) {
          window
            .initLocationPicker()
            .then(() => {
              const sList = Array.from(
                inner.querySelectorAll('select#client-state, select[name="state"]')
              );
              sList.forEach((s) => {
                if (
                  window.populateLgasForSelect &&
                  typeof window.populateLgasForSelect === 'function'
                ) {
                  try {
                    window.populateLgasForSelect(s);
                  } catch (e) {
                    console.warn('populateLgasForSelect after init failed', e);
                  }
                } else {
                  try {
                    s.dispatchEvent(new Event('change', { bubbles: true }));
                  } catch (e) {}
                }
              });
            })
            .catch((e) => console.warn('initLocationPicker failed', e));
        }
      }
    } catch (e) {
      console.warn('Address panel population failed', e);
    }

    try {
      history.pushState(
        { section: 'section-account-edit', sub: innerId },
        '',
        `#${innerId}`
      );
    } catch (e) {
      location.hash = innerId;
    }
  }

  /* ---------------------------
     Nav wiring and keyboard accessibility
     --------------------------- */
  navButtons.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const target = btn.dataset.target;
      if (!target) return;
      showTarget(target, { push: true });
    });
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        btn.click();
      }
    });
  });

  function wireAccountEditToggles() {
    document
      .querySelectorAll(
        '.account-edit-toggle, .subnav-item, [data-target^="section-account"], .icon-card[data-target]'
      )
      .forEach((btn) => {
        if (btn.__acctToggleBound) return;
        btn.__acctToggleBound = true;

        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const target = btn.dataset.target;
          if (!target) return;

          if (target.startsWith('section-account-edit')) {
            showInnerPanel(target);
            return;
          }

          showTarget(target, { push: true });
        });

        btn.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            btn.click();
          }
        });
      });

    document.querySelectorAll('.icon-card[data-href]').forEach((card) => {
      if (card.__hrefBound) return;
      card.__hrefBound = true;

      card.addEventListener('click', (e) => {
        const href = card.dataset.href;
        if (!href) return;
        location.href = href;
      });

      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          card.click();
        }
      });
    });
  }

  document.addEventListener('click', (e) => {
    const ancestor = e.target.closest && e.target.closest('.app-nav');
    if (ancestor) hideFlash();
  });

  window.addEventListener('popstate', (e) => {
    const state = e.state || {};
    if (state.section === 'section-account-edit' && state.sub) {
      showInnerPanel(state.sub, { push: false });
      return;
    }

    const id =
      state.section ||
      (location.hash ? location.hash.replace('#', '') : null) ||
      'section-account';
    if (document.getElementById(id)) {
      showTarget(id, { push: false });
      return;
    }

    const hash = location.hash ? location.hash.replace('#', '') : null;
    if (hash && hash.startsWith('section-account-edit')) {
      showInnerPanel(hash, { push: false });
      return;
    }

    if (document.getElementById('section-account'))
      showTarget('section-account', { push: false });
  });

  /* ---------------------------
     State/LGA autocomplete
     --------------------------- */
  function initStateLgaAutocomplete() {
    const STATES_URL = '/locations/Nigeria-State-Lga.json';
    const stateInput = document.getElementById('vendor-search-state');
    const lgaInput = document.getElementById('vendor-search-lga');
    const statesDatalist = document.getElementById('states-datalist');
    const lgasDatalist = document.getElementById('lgas-datalist');

    if (!statesDatalist || !lgasDatalist || !stateInput) return;

    fetch(STATES_URL, { cache: 'force-cache' })
      .then((res) => {
        if (!res.ok) throw new Error('Could not load states/LGAs');
        return res.json();
      })
      .then((data) => {
        const lookup = {};
        const stateNames = [];

        if (Array.isArray(data)) {
          data.forEach((item) => {
            const s = item.state || item.name || null;
            const lgas = Array.isArray(item.lgas) ? item.lgas : item.lga || [];
            if (s) {
              lookup[s] = lgas;
              stateNames.push(s);
            }
          });
        } else if (typeof data === 'object' && data !== null) {
          Object.keys(data).forEach((k) => {
            lookup[k] = Array.isArray(data[k]) ? data[k] : [];
            stateNames.push(k);
          });
        }

        statesDatalist.innerHTML = stateNames
          .map((s) => `<option value="${s}"></option>`)
          .join('');

        const initialState = stateInput.value && stateInput.value.trim();
        if (initialState && lookup[initialState]) {
          lgasDatalist.innerHTML = lookup[initialState]
            .map((l) => `<option value="${l}"></option>`)
            .join('');
        }

        stateInput.addEventListener('input', () => {
          const s = stateInput.value && stateInput.value.trim();
          const lgas = s && lookup[s] ? lookup[s] : [];
          lgasDatalist.innerHTML = lgas
            .map((l) => `<option value="${l}"></option>`)
            .join('');
          if (
            lgaInput &&
            lgaInput.value &&
            lgas.indexOf(lgaInput.value) === -1
          ) {
            lgaInput.value = '';
          }
        });
      })
      .catch((err) => {
        console.warn('State/LGA autocomplete unavailable:', err);
      });
  }

  /* ---------------------------
     Vendor search clear button
     --------------------------- */
  function wireVendorClear() {
    const clearBtn = document.getElementById('vendor-search-clear');
    const form = document.querySelector('.vendor-search-form');
    if (!clearBtn || !form) return;

    clearBtn.addEventListener('click', (e) => {
      e.preventDefault();

      form
        .querySelectorAll(
          'input[name="q"], input[name="state"], input[name="lga"]'
        )
        .forEach((i) => {
          i.value = '';
          try {
            i.dispatchEvent(new Event('input', { bubbles: true }));
          } catch (err) {}
        });

      form.action = '/client/dashboard#section-vendors';
      form.submit();
    });
  }

  /* ---------------------------
     Initial load / restore behavior
     --------------------------- */
  document.addEventListener('DOMContentLoaded', () => {
    try {
      initStateLgaAutocomplete();
    } catch (e) {
      console.warn('initStateLgaAutocomplete failed', e);
    }
    try {
      wireVendorClear();
    } catch (e) {
      console.warn('wireVendorClear failed', e);
    }

    try {
      wireAccountEditToggles();
    } catch (e) {
      console.warn('wireAccountEditToggles failed', e);
    }

    document.querySelectorAll('.icon-card[tabindex]').forEach((ic) => {
      if (ic.__kbdBound) return;
      ic.__kbdBound = true;
      ic.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          ic.click();
        }
      });
    });

    const initial =
      (history.state && history.state.section) ||
      (location.hash ? location.hash.replace('#', '') : 'section-account');

    const urlParams = new URLSearchParams(location.search);
    const hasVendorSearch =
      urlParams.has('q') || urlParams.has('state') || urlParams.has('lga');

    let finalPanel = initial;

    if (initial === 'section-account' || initial === null) {
      if (window.ORDER_ID) finalPanel = 'section-orders';
      else if (window.WEEKLY_PLAN_ID) finalPanel = 'section-weekly';
      else if (window.WALLET_TX_ID) finalPanel = 'section-wallet';
      else if (hasVendorSearch) finalPanel = 'section-vendors';
    } else {
      if (initial === 'section-account' && hasVendorSearch)
        finalPanel = 'section-vendors';
    }

    const hash = location.hash ? location.hash.replace('#', '') : null;
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

    /* ---------------------------
       existing window.ORDER_ID / WEEKLY_PLAN handling (unchanged)
       --------------------------- */
    if (
      window.ORDER_ID &&
      (finalPanel === 'section-orders' ||
        finalPanel === 'section-account' ||
        finalPanel === null)
    ) {
      if (document.getElementById('section-orders'))
        showTarget('section-orders', { push: false });

      const tryOpenChat = () => {
        const chatBtn = document.querySelector(
          `.btn-view-chat[data-order-id="${window.ORDER_ID}"]`
        );
        if (chatBtn) {
          try {
            chatBtn.focus({ preventScroll: true });
          } catch (e) {}
        } else {
          let retries = 0;
          const id = setInterval(() => {
            retries++;
            const btn = document.querySelector(
              `.btn-view-chat[data-order-id="${window.ORDER_ID}"]`
            );
            if (btn) {
              try {
                btn.focus({ preventScroll: true });
              } catch (e) {}
              clearInterval(id);
            } else if (retries > 10) clearInterval(id);
          }, 80);
        }
      };
      setTimeout(tryOpenChat, 40);
    }

    if (
      window.WEEKLY_PLAN_ID &&
      (finalPanel === 'section-weekly' ||
        finalPanel === 'section-account' ||
        finalPanel === null)
    ) {
      if (document.getElementById('section-weekly'))
        showTarget('section-weekly', { push: false });

      const tryOpenWeekly = () => {
        const selector = `a[href$="/client/special-order/${window.WEEKLY_PLAN_ID}"], a[href*="/client/special-order/${window.WEEKLY_PLAN_ID}"]`;
        const viewLink = document.querySelector(selector);
        if (viewLink) {
          try {
            viewLink.focus({ preventScroll: true });
          } catch (e) {}
        } else {
          const createBtn = document.querySelector(
            '#section-weekly a.btn, #section-weekly button.btn'
          );
          if (createBtn) createBtn.focus({ preventScroll: true });
          let retries = 0;
          const id = setInterval(() => {
            retries++;
            const btn = document.querySelector(selector);
            if (btn) {
              try {
                btn.focus({ preventScroll: true });
              } catch (e) {}
              clearInterval(id);
            } else if (retries > 10) clearInterval(id);
          }, 80);
        }
      };
      setTimeout(tryOpenWeekly, 40);
    }

    if (
      window.WALLET_TX_ID &&
      (finalPanel === 'section-wallet' ||
        finalPanel === 'section-account' ||
        finalPanel === null)
    ) {
      if (document.getElementById('section-wallet'))
        showTarget('section-wallet', { push: false });

      const tryFocusWallet = () => {
        const candidates = [
          document.getElementById('wallet-balance'),
          document.querySelector(
            '#section-wallet input[name="amount"], #section-wallet input[type="number"]'
          ),
          document.querySelector('#section-wallet button, #section-wallet a.btn'),
        ];
        for (const el of candidates) {
          if (el) {
            try {
              el.focus({ preventScroll: true });
            } catch (e) {}
            return;
          }
        }

        let retries = 0;
        const id = setInterval(() => {
          retries++;
          const el =
            document.getElementById('wallet-balance') ||
            document.querySelector(
              '#section-wallet input[name="amount"], #section-wallet input[type="number"]'
            ) ||
            document.querySelector('#section-wallet button, #section-wallet a.btn');
          if (el) {
            try {
              el.focus({ preventScroll: true });
            } catch (e) {}
            clearInterval(id);
          } else if (retries > 12) {
            clearInterval(id);
          }
        }, 80);
      };

      setTimeout(tryFocusWallet, 40);
    }

    document.documentElement.classList.add('js-ready');

    window.addEventListener('hashchange', () => {
      const id = location.hash.replace('#', '');
      if (!id) return;
      if (id.startsWith('section-account-edit') && document.getElementById(id)) {
        showInnerPanel(id, { push: false });
      } else if (document.getElementById(id)) {
        showTarget(id, { push: false });
      }
    });

    /* ---------------------------
       VENDOR AUTO-OPEN (handle ?vendorId=...) - run after initial panel selection
       --------------------------- */

    // helper: get query param safely
    function safeQueryParam(name) {
      try {
        const params = new URLSearchParams(window.location.search);
        return params.get(name);
      } catch (e) {
        return null;
      }
    }

    function removeQueryParam(name) {
      try {
        const url = new URL(window.location);
        url.searchParams.delete(name);
        window.history.replaceState({}, document.title, url.pathname + url.search + url.hash);
      } catch (e) {
        // ignore
      }
    }

    function highlightElement(el) {
      if (!el) return;
      el.classList.add('vendor-highlight-temp');
      setTimeout(() => el.classList.remove('vendor-highlight-temp'), 4500);
    }

    function prefillBookingForm(vendorId) {
      let form = document.querySelector('#quick-order-form') || document.querySelector('form[action="/client/book"]');
      if (!form) {
        form = document.querySelector('.vendors-list form[action="/client/book"]') || null;
      }
      if (!form) return false;

      let hid = form.querySelector('input[name="vendorId"]');
      if (!hid) {
        hid = document.createElement('input');
        hid.type = 'hidden';
        hid.name = 'vendorId';
        form.prepend(hid);
      }
      hid.value = vendorId;

      const quickModal = document.getElementById('quick-order-modal');
      if (quickModal) {
        quickModal.setAttribute('aria-hidden', 'false');
        quickModal.style.display = 'flex';
        const first = form.querySelector('input[type="text"], select, textarea, button');
        if (first) first.focus();
      }

      return true;
    }

    function scrollToVendor(vendorId) {
      if (!vendorId) return false;

      let el = document.querySelector(`a[href="/vendor/${vendorId}"]`);
      if (!el) el = document.querySelector(`article[data-vendor-id="${vendorId}"]`);
      if (!el) el = document.querySelector(`form input[name="vendorId"][value="${vendorId}"]`);
      if (el) {
        if (el.tagName === 'INPUT') el = el.closest('article') || el.closest('.vendor-card') || el;
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        highlightElement(el);
        return true;
      }
      return false;
    }

    function tryAutoOpenForVendor(vendorId) {
      if (!vendorId) return false;

      // open orders section so booking UI is visible
      showTarget('section-orders', { push: false });

      const didPrefill = prefillBookingForm(vendorId);
      const didScroll = scrollToVendor(vendorId);
      return didPrefill || didScroll;
    }

    // run vendorId flow
    try {
      const vendorId = safeQueryParam('vendorId');
      if (vendorId) {
        const ok = tryAutoOpenForVendor(vendorId);
        removeQueryParam('vendorId');

        if (!ok) {
          showTarget('section-vendors', { push: false });
          const msg = document.createElement('div');
          msg.className = 'vendor-prefill-toast';
          msg.textContent = 'Ready to book — find the vendor under "Find local vendor" or use search.';
          Object.assign(msg.style, {
            position: 'fixed',
            right: '16px',
            bottom: '16px',
            background: '#0b74ff',
            color: '#fff',
            padding: '10px 14px',
            borderRadius: '10px',
            zIndex: 9999,
            boxShadow: '0 8px 22px rgba(2,10,50,0.18)',
            fontWeight: 700,
          });
          document.body.appendChild(msg);
          setTimeout(() => msg.remove(), 4200);
        }
      } else if (window.location.hash && window.location.hash.indexOf('section-orders') !== -1) {
        showTarget('section-orders', { push: false });
      }
    } catch (err) {
      console.warn('vendor auto-open error', err);
    }
  });

  /* ---------------------------
     Accessibility: icon-card click bindings (redundant safe append)
     --------------------------- */
  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.icon-card[data-href]').forEach(function (el) {
      el.style.cursor = 'pointer';
      el.addEventListener('click', function () {
        const href = el.getAttribute('data-href');
        if (!href) return;
        window.location.href = href;
      });
      el.addEventListener('keypress', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          el.click();
        }
      });
    });
  });

  /* ---------------------------
     Small CSS injection for highlight + toast fallback
     --------------------------- */
  try {
    const style = document.createElement('style');
    style.innerHTML = `
      .vendor-highlight-temp {
        box-shadow: 0 16px 40px rgba(11,92,255,0.12) !important;
        transform: translateY(-6px);
        transition: all 0.25s ease;
        border-radius: 12px;
      }
      .vendor-prefill-toast { font-family: inherit; }
    `;
    document.head.appendChild(style);
  } catch (e) {
    // ignore
  }
})();

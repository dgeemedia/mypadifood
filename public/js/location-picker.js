// public/js/location-picker.js (overwrite with this)
(function () {
  function parseStatesData(raw) {
    if (!raw) return [];
    // If it's already an object/array, return it immediately
    if (typeof raw === 'object') return raw;
    try {
      const unescaped = String(raw)
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#39;/g, "'");
      const trimmed = unescaped.trim();
      const stripped =
        trimmed.length > 1 && trimmed[0] === "'" && trimmed[trimmed.length - 1] === "'"
          ? trimmed.slice(1, -1)
          : trimmed;
      return JSON.parse(stripped);
    } catch (e) {
      console.error('location-picker: failed to parse states data', e, { raw });
      return [];
    }
  }

  function loadStates() {
    // Prefer window.STATE_DATA if present and already an object/array
    if (window && typeof window.STATE_DATA !== 'undefined') {
      return parseStatesData(window.STATE_DATA);
    }
    const el = document.getElementById('states-data');
    if (el && el.dataset && el.dataset.states) {
      return parseStatesData(el.dataset.states);
    }
    return [];
  }

  function findLgaSelect(stateSelect) {
    if (!stateSelect) return null;
    const form = stateSelect.closest('form');
    if (form) {
      const byName = form.querySelector(
        'select[name="region_lga"], select[name="lga"], input[name="lga"]'
      );
      if (byName) return byName;
    }
    const idMap = {
      'client-state': 'client-lga',
      'vendor-state': 'vendor-lga',
      'admin-region-state': 'admin-region-lga',
    };
    if (stateSelect.id && idMap[stateSelect.id]) {
      const elem = document.getElementById(idMap[stateSelect.id]);
      if (elem) return elem;
    }
    return document.querySelector('select[name="region_lga"], select[name="lga"]');
  }

  function findEntryForState(statesData, stateName) {
    if (!stateName) return null;
    const normalized = String(stateName).trim().toLowerCase();
    return statesData.find((s) => String(s.state || '').trim().toLowerCase() === normalized);
  }

  function normalizeVal(v) {
    return v == null ? '' : String(v).trim();
  }

  function populateLgasFor(stateSelect, statesData) {
    if (!stateSelect) return;
    const lgaSelect = findLgaSelect(stateSelect);
    if (!lgaSelect) {
      console.warn('location-picker: no LGA select found for', stateSelect);
      return;
    }

    // get previous selection (value attr) OR data-selected HTML attr (server-supplied)
    const previousRaw = normalizeVal(lgaSelect.value) ||
                        normalizeVal(lgaSelect.dataset && lgaSelect.dataset.selected) ||
                        normalizeVal(lgaSelect.getAttribute && lgaSelect.getAttribute('data-selected'));
    const previous = previousRaw;

    // clear options
    lgaSelect.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Select LGA';
    lgaSelect.appendChild(placeholder);

    const stateName = normalizeVal(stateSelect.value);
    if (!stateName) {
      return;
    }

    const entry = findEntryForState(statesData, stateName);
    if (!entry || !Array.isArray(entry.lgas)) {
      // No lgas found for state; if server supplied previous, preserve it
      if (previous) {
        const opt = document.createElement('option');
        opt.value = previous;
        opt.textContent = previous;
        lgaSelect.appendChild(opt);
        lgaSelect.value = previous;
      }
      return;
    }

    // populate official LGAs
    entry.lgas.forEach((lga) => {
      const opt = document.createElement('option');
      opt.value = lga;
      opt.textContent = lga;
      lgaSelect.appendChild(opt);
    });

    // restore previous selection (case-insensitive compare, trim)
    if (previous) {
      const found = Array.from(lgaSelect.options).some(
        (o) => normalizeVal(o.value).toLowerCase() === previous.toLowerCase()
      );
      if (found) {
        // set the option that matches (preserve original casing)
        for (const o of lgaSelect.options) {
          if (normalizeVal(o.value).toLowerCase() === previous.toLowerCase()) {
            lgaSelect.value = o.value;
            break;
          }
        }
      } else {
        // if previous not in list, append it so user sees stored value
        const customOpt = document.createElement('option');
        customOpt.value = previous;
        customOpt.textContent = previous;
        lgaSelect.appendChild(customOpt);
        lgaSelect.value = previous;
      }
    }
  }

  function init() {
    const statesData = loadStates();
    if (!Array.isArray(statesData) || statesData.length === 0) {
      console.debug('location-picker: no states data found (empty).');
      return;
    }

    const selectorList = [
      'select[name="state"]',
      'select#client-state',
      'select#vendor-state',
      'select#admin-region-state',
    ];
    const stateSelectors = Array.from(document.querySelectorAll(selectorList.join(',')));

    stateSelectors.forEach((sel) => {
      // populate immediately if server already set a state value
      if (sel.value) populateLgasFor(sel, statesData);

      sel.addEventListener('change', function () {
        populateLgasFor(sel, statesData);
      });
    });

    // observe for dynamically added selects (same as before)
    const observer = new MutationObserver((mutations, obs) => {
      const newly = Array.from(document.querySelectorAll(selectorList.join(','))).filter((s) => !stateSelectors.includes(s));
      if (newly.length) {
        newly.forEach((sel) => {
          if (sel.value) populateLgasFor(sel, statesData);
          sel.addEventListener('change', () => populateLgasFor(sel, statesData));
          stateSelectors.push(sel);
        });
      }
      setTimeout(() => obs.disconnect(), 3000);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // small delay to allow server-inserted data/script to load before init
    setTimeout(init, 0);
  }
})();

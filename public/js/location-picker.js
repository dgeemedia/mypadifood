/* public/js/location-picker.js
   - Reads states/LGAs from #states-data[data-states]
   - Populates matching LGA <select> when a state is selected
   - Works for client/vendor/admin forms by id or name
*/
(function () {
  // helper: safe parse JSON
  function parseStatesData(raw) {
    if (!raw) return [];
    try {
      return typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch (e) {
      console.error("location-picker: failed to parse states data", e);
      return [];
    }
  }

  // read data from the hidden DOM element first, else fallback to window.STATE_DATA
  function loadStates() {
    const el = document.getElementById("states-data");
    if (el && el.dataset && el.dataset.states) {
      return parseStatesData(el.dataset.states);
    }
    if (window.STATE_DATA) return parseStatesData(window.STATE_DATA);
    return [];
  }

  // find the LGA select related to the given state select
  function findLgaSelect(stateSelect) {
    if (!stateSelect) return null;
    // prefer same-form inputs
    const form = stateSelect.closest("form");
    if (form) {
      const byName = form.querySelector(
        'select[name="region_lga"], select[name="lga"], input[name="lga"]'
      );
      if (byName) return byName;
    }

    // id mapping fallback
    const idMap = {
      "client-state": "client-lga",
      "vendor-state": "vendor-lga",
      "admin-region-state": "admin-region-lga",
    };
    if (stateSelect.id && idMap[stateSelect.id]) {
      const elem = document.getElementById(idMap[stateSelect.id]);
      if (elem) return elem;
    }

    // last-resort: first LGA select on the page
    return document.querySelector('select[name="region_lga"], select[name="lga"]');
  }

  // robust name match (trim + case-insensitive)
  function findEntryForState(statesData, stateName) {
    if (!stateName) return null;
    const normalized = String(stateName).trim().toLowerCase();
    return statesData.find((s) => String(s.state || "").trim().toLowerCase() === normalized);
  }

  // populate the LGA select with options for the chosen state
  function populateLgasFor(stateSelect, statesData) {
    if (!stateSelect) return;
    const lgaSelect = findLgaSelect(stateSelect);
    if (!lgaSelect) {
      console.warn("location-picker: no LGA select found for", stateSelect);
      return;
    }

    const previous = lgaSelect.value || "";
    // clear
    lgaSelect.innerHTML = "";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Select LGA";
    lgaSelect.appendChild(placeholder);

    const stateName = stateSelect.value;
    if (!stateName) return;

    const entry = findEntryForState(statesData, stateName);
    if (!entry || !Array.isArray(entry.lgas)) return;

    entry.lgas.forEach((lga) => {
      const opt = document.createElement("option");
      opt.value = lga;
      opt.textContent = lga;
      lgaSelect.appendChild(opt);
    });

    // restore previous selection if still present
    if (previous) {
      const found = Array.from(lgaSelect.options).some((o) => o.value === previous);
      if (found) lgaSelect.value = previous;
    }
  }

  // attach listeners to all state selects found by selectors
  function init() {
    const statesData = loadStates();
    if (!Array.isArray(statesData) || statesData.length === 0) {
      console.debug("location-picker: no states data found (empty).");
      return;
    }

    const selectorList = [
      'select[name="state"]',
      'select#client-state',
      'select#vendor-state',
      'select#admin-region-state',
    ];
    const stateSelectors = Array.from(document.querySelectorAll(selectorList.join(",")));

    if (!stateSelectors.length) {
      // maybe the page renders selects later (AJAX). Watch for added nodes once for a short time.
      console.debug("location-picker: no state selects found on initial run.");
    }

    stateSelectors.forEach((sel) => {
      // populate immediately if state already selected (server-side sticky)
      if (sel.value) populateLgasFor(sel, statesData);

      sel.addEventListener("change", function () {
        populateLgasFor(sel, statesData);
      });
    });

    // Also support dynamically added state selects by observing the document for a short window
    const observer = new MutationObserver((mutations, obs) => {
      const newly = Array.from(document.querySelectorAll(selectorList.join(","))).filter(
        (s) => !stateSelectors.includes(s)
      );
      if (newly.length) {
        newly.forEach((sel) => {
          if (sel.value) populateLgasFor(sel, statesData);
          sel.addEventListener("change", () => populateLgasFor(sel, statesData));
          stateSelectors.push(sel);
        });
      }
      // stop observing after 3s to avoid overhead
      setTimeout(() => obs.disconnect(), 3000);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // run on DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

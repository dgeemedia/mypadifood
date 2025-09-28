// public/js/location-picker.js
(function () {
  if (typeof document === "undefined") return;

  // Try to read server-provided states data from the hidden element
  let data = [];
  const el = document.getElementById("states-data");
  if (el) {
    const raw = el.getAttribute("data-states");
    try {
      data = raw ? JSON.parse(raw) : [];
    } catch (err) {
      console.error("Failed to parse states-data JSON", err);
      data = [];
    }
  }

  // Expect data shape: [{ state: "Lagos", lgas: ["Ikeja", "Eti-Osa"] }, ...]
  if (!Array.isArray(data) || data.length === 0) return;

  function findLgaSelect(stateSelect) {
    const form = stateSelect.closest("form");
    if (form) {
      const lgaByName = form.querySelector('select[name="lga"], input[name="lga"]');
      if (lgaByName) return lgaByName;
    }
    const idMap = {
      "client-state": "client-lga",
      "vendor-state": "vendor-lga",
    };
    if (stateSelect.id && idMap[stateSelect.id]) {
      return document.getElementById(idMap[stateSelect.id]);
    }
    return document.querySelector('select[name="lga"]');
  }

  function populateLgas(stateSelect) {
    const stateName = stateSelect.value;
    const lgaSelect = findLgaSelect(stateSelect);
    if (!lgaSelect) return;
    const previous = lgaSelect.value;
    lgaSelect.innerHTML = '<option value="">Select LGA</option>';
    if (!stateName) return;
    const entry = data.find((s) => s.state === stateName);
    if (!entry || !Array.isArray(entry.lgas)) return;
    entry.lgas.forEach((l) => {
      const opt = document.createElement("option");
      opt.value = l;
      opt.textContent = l;
      lgaSelect.appendChild(opt);
    });
    if (previous) {
      const found = Array.from(lgaSelect.options).some((o) => o.value === previous);
      if (found) lgaSelect.value = previous;
    }
  }

  // Attach listeners to all state selects on the page
  const stateSelectors = Array.from(
    document.querySelectorAll('select[name="state"], select#client-state, select#vendor-state')
  );
  stateSelectors.forEach((sel) => {
    sel.addEventListener("change", () => populateLgas(sel));
    // populate immediately if a state is preselected (e.g., editing or preserved form)
    if (sel.value) populateLgas(sel);
  });
})();

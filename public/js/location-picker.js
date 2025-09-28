(function () {
  if (!Array.isArray(data) || data.length === 0) return;

  function findLgaSelect(stateSelect) {
    const form = stateSelect.closest('form');
    if (form) {
      const lgaByName = form.querySelector(
        'select[name="region_lga"], select[name="lga"], input[name="lga"]'
      );
      if (lgaByName) return lgaByName;
    }

    const idMap = {
      'client-state': 'client-lga',
      'vendor-state': 'vendor-lga',
      'admin-region-state': 'admin-region-lga',
    };

    if (stateSelect.id && idMap[stateSelect.id]) {
      return document.getElementById(idMap[stateSelect.id]);
    }

    // fallback: the first select[name="region_lga"] or select[name="lga"] on page
    return document.querySelector(
      'select[name="region_lga"], select[name="lga"]'
    );
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
      const opt = document.createElement('option');
      opt.value = l;
      opt.textContent = l;
      lgaSelect.appendChild(opt);
    });
    if (previous) {
      const found = Array.from(lgaSelect.options).some(
        (o) => o.value === previous
      );
      if (found) lgaSelect.value = previous;
    }
  }

  // Attach listeners to all state selects on the page
  const selectorList = [
    'select[name="state"]',
    'select#client-state',
    'select#vendor-state',
    'select#admin-region-state',
  ];

  const stateSelectors = Array.from(
    document.querySelectorAll(selectorList.join(','))
  );
  stateSelectors.forEach((sel) => {
    sel.addEventListener('change', () => populateLgas(sel));
    // populate immediately if a state is preselected (e.g., editing or preserved form)
    if (sel.value) populateLgas(sel);
  });
})();

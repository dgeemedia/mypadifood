// public/js/admin-resources.js
(function () {
  function $id(id) { return document.getElementById(id); }
  function safeText(s) { return s == null ? '' : String(s); }

  // build table DOM from rows and type
  function buildTable(type, rows) {
    if (!rows || !rows.length) {
      return '<div class="empty-resources">No results</div>';
    }

    let html = '<table class="resources-table" role="table"><thead><tr><th>Type</th><th>Name</th><th>Contact</th><th>State/LGA</th><th>Details</th></tr></thead><tbody>';
    rows.forEach(r => {
      html += '<tr>';
      html += `<td data-label="Type">${type === 'vendors' ? 'Vendor' : 'Rider'}</td>`;
      html += `<td data-label="Name"><strong>${safeText(r.name || r.full_name)}</strong></td>`;
      html += `<td data-label="Contact"><div class="muted">${safeText(r.phone || r.contact || '')}</div>${r.email ? `<div class="muted small">${safeText(r.email)}</div>` : ''}</td>`;
      html += `<td data-label="State/LGA">${safeText(r.state)} / ${safeText(r.lga)}</td>`;
      html += '<td data-label="Details">';
      if (type === 'vendors') {
        html += `<div>Address: ${safeText(r.address)}</div><div>Base price: ${r.base_price ? '₦' + r.base_price : '—'}</div>`;
      } else {
        html += `<div>Vehicle: ${safeText(r.vehicle_type)}</div><div>Vehicle no: ${safeText(r.vehicle_number)}</div>`;
        if (r.id_file) {
          // show thumbnail link if available
          html += `<div><a href="/${safeText(r.id_file)}" target="_blank" rel="noopener">View ID</a></div>`;
        }
      }
      html += '</td>';
      html += '</tr>';
    });
    html += '</tbody></table>';
    return html;
  }

  function loadStates() {
    if (window.STATE_DATA) return window.STATE_DATA;
    const el = document.getElementById('states-data');
    if (el && el.dataset && el.dataset.states) {
      try { return JSON.parse(el.dataset.states); } catch (e) { return []; }
    }
    return [];
  }

  function populateLgaOptions(stateSelect, lgaSelect) {
    const states = loadStates();
    const stateName = stateSelect.value;
    lgaSelect.innerHTML = '<option value="">All LGAs</option>';
    if (!stateName) return;
    const entry = states.find(s => String(s.state).trim().toLowerCase() === stateName.trim().toLowerCase());
    if (!entry || !Array.isArray(entry.lgas)) return;
    entry.lgas.forEach(l => {
      const o = document.createElement('option');
      o.value = l; o.textContent = l;
      lgaSelect.appendChild(o);
    });
  }

  function fetchAndRender() {
    const type = $id('resource-type').value;
    const state = $id('resource-state').value;
    const lga = $id('resource-lga').value;
    const params = new URLSearchParams({ type, state, lga });
    fetch('/admin/resources/data?' + params.toString(), { credentials: 'same-origin' })
      .then(r => r.json())
      .then(json => {
        if (!json || !json.ok) {
          $id('resource-list').innerHTML = `<div class="empty-resources">Error loading resources</div>`;
          return;
        }
        $id('resource-list').innerHTML = buildTable(type, json.rows || []);
      })
      .catch(err => {
        console.error('admin-resources fetch error', err);
        $id('resource-list').innerHTML = `<div class="empty-resources">Network error</div>`;
      });
  }

  document.addEventListener('DOMContentLoaded', function () {
    const stateSel = $id('resource-state');
    const lgaSel = $id('resource-lga');
    const typeSel = $id('resource-type');
    const refresh = $id('resource-refresh');

    if (stateSel && lgaSel) {
      stateSel.addEventListener('change', () => populateLgaOptions(stateSel, lgaSel));
      // initial populate if state already selected
      populateLgaOptions(stateSel, lgaSel);
    }

    if (typeSel) {
      typeSel.addEventListener('change', fetchAndRender);
    }
    if (refresh) refresh.addEventListener('click', fetchAndRender);

    // Load initial data (vendors by default)
    fetchAndRender();
  });
})();

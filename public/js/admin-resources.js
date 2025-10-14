// public/js/admin-resources.js
(function () {
  function $id(id) {
    return document.getElementById(id);
  }
  function safeText(s) {
    return s == null ? '' : String(s);
  }

  // build table DOM from rows and type
function buildTable(type, rows) {
  if (!rows || !rows.length) {
    return '<div class="empty-resources">No results</div>';
  }

  // Table header (includes an explicit Address column)
  let html = ''
    + '<table class="resources-table" role="table">'
    + '<thead><tr>'
    + '<th>Type</th><th>Name</th><th>Contact</th><th>State / LGA</th><th>Address</th><th>Extra</th><th>Details</th>'
    + '</tr></thead><tbody>';

  rows.forEach((r) => {
    const name = safeText(r.name || r.full_name || '—');
    const phone = safeText(r.phone || r.contact || '—');
    const emailHtml = r.email ? `<div class="muted small">${safeText(r.email)}</div>` : '';
    const state = safeText(r.state || '');
    const lga = safeText(r.lga || '');
    const address = safeText(r.address || r.location || r.address_line || r.residence || '—');

    html += '<tr>';
    html += `<td data-label="Type">${type === 'vendors' ? 'Vendor' : 'Rider'}</td>`;
    html += `<td data-label="Name"><strong>${name}</strong></td>`;
    html += `<td data-label="Contact"><div class="muted">${phone}</div>${emailHtml}</td>`;
    html += `<td data-label="State/LGA">${state} / ${lga}</td>`;
    html += `<td data-label="Address">${address}</td>`;

    // Extra column (compact summary)
    if (type === 'vendors') {
      const basePrice = r.base_price ? '₦' + safeText(r.base_price) : '—';
      const foodItem = r.food_item ? safeText(r.food_item) : '—';
      html += `<td data-label="Extra"><div>Base: ${basePrice}</div><div>Item: ${foodItem}</div></td>`;
    } else {
      const vehicle = safeText(r.vehicle_type || '—');
      const vehicleNo = safeText(r.vehicle_number || '—');
      html += `<td data-label="Extra"><div>Vehicle: ${vehicle}</div><div>No: ${vehicleNo}</div></td>`;
    }

    // Details column (bank, status, id link)
    html += '<td data-label="Details">';
    const bank = (r.bank_name || r.account_number) ? `Bank: ${safeText(r.bank_name || '—')} / ${safeText(r.account_number || '—')}` : 'Bank: —';
    html += `<div>${bank}</div>`;
    if (type === 'riders') {
      html += `<div>Status: ${safeText(r.status || '—')}</div>`;
    }
    if (r.id_file) {
      html += `<div><a href="/${safeText(r.id_file)}" target="_blank" rel="noopener">View ID</a></div>`;
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
      try {
        return JSON.parse(el.dataset.states);
      } catch (e) {
        return [];
      }
    }
    return [];
  }

  function populateLgaOptions(stateSelect, lgaSelect) {
    const states = loadStates();
    const stateName = stateSelect.value;
    lgaSelect.innerHTML = '<option value="">All LGAs</option>';
    if (!stateName) return;
    const entry = states.find(
      (s) =>
        String(s.state).trim().toLowerCase() === stateName.trim().toLowerCase()
    );
    if (!entry || !Array.isArray(entry.lgas)) return;
    entry.lgas.forEach((l) => {
      const o = document.createElement('option');
      o.value = l;
      o.textContent = l;
      lgaSelect.appendChild(o);
    });
  }

  function fetchAndRender() {
    const type = $id('resource-type').value;
    const state = $id('resource-state').value;
    const lga = $id('resource-lga').value;
    const params = new URLSearchParams({ type, state, lga });
    fetch('/admin/resources/data?' + params.toString(), {
      credentials: 'same-origin',
    })
      .then((r) => r.json())
      .then((json) => {
        if (!json || !json.ok) {
          $id('resource-list').innerHTML =
            `<div class="empty-resources">Error loading resources</div>`;
          return;
        }
        $id('resource-list').innerHTML = buildTable(type, json.rows || []);
      })
      .catch((err) => {
        console.error('admin-resources fetch error', err);
        $id('resource-list').innerHTML =
          `<div class="empty-resources">Network error</div>`;
      });
  }

  document.addEventListener('DOMContentLoaded', function () {
    const stateSel = $id('resource-state');
    const lgaSel = $id('resource-lga');
    const typeSel = $id('resource-type');
    const refresh = $id('resource-refresh');

    if (stateSel && lgaSel) {
      stateSel.addEventListener('change', () =>
        populateLgaOptions(stateSel, lgaSel)
      );
      // initial populate if state already selected
      populateLgaOptions(stateSel, lgaSel);
    }

    if (typeSel) {
      typeSel.addEventListener('change', fetchAndRender);
    }
    if (refresh) refresh.addEventListener('click', fetchAndRender);

    // Export button handler (uses same filters)
    const exportBtn = $id('resource-export');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        const type = $id('resource-type').value;
        const state = $id('resource-state').value;
        const lga = $id('resource-lga').value;
        const params = new URLSearchParams({ type, state, lga });
        // trigger download
        window.location = '/admin/resources/export?' + params.toString();
      });
    }

    // Load initial data (vendors by default)
    fetchAndRender();
  });
})();

// public/js/main.js
import { getVendorsNearby, fetchVendors } from './vendors.mjs';
import { initWhatsApp } from './wa.mjs';
import { initVendorSignup } from './vendor-signup.mjs';

/* -------------------------
   Utility: read page config from #padi-config (non-executing JSON)
   ------------------------- */
function readPageConfig() {
  try {
    const el = document.getElementById('padi-config');
    if (!el) return {};
    return JSON.parse(el.textContent || el.innerText || '{}');
  } catch (err) {
    console.warn('readPageConfig parse error', err);
    return {};
  }
}

/* ===========================
   Vendor list UI (client-side)
   =========================== */
const vendorsList = document.getElementById('vendorsList');
const btnFind = document.getElementById('btn-find-near');
const filter = document.getElementById('filterStatus');

function formatPrice(n) {
  if (n == null || n === '') return '—';
  try {
    return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(n);
  } catch (e) {
    return `₦${n}`;
  }
}

function clearChildren(el) {
  while (el?.firstChild) el.removeChild(el.firstChild);
}

function createBadge(status) {
  const s = document.createElement('span');
  s.className = `badge ${status === 'verified' ? 'badge--green' : 'badge--orange'}`;
  s.textContent = status || 'unknown';
  return s;
}

function toIntl(phone) {
  if (!phone) return '2348110252143';
  let cleaned = ('' + phone).replace(/\D/g, '');
  if (cleaned.startsWith('0')) cleaned = '234' + cleaned.slice(1);
  if (cleaned.length < 7) return '2348110252143';
  return cleaned;
}

function createCard(vendor) {
  const card = document.createElement('article');
  card.className = 'card';
  card.setAttribute('data-id', vendor.id || '');

  if (vendor.image_path || vendor.image) {
    const img = document.createElement('img');
    img.src = vendor.image_path || vendor.image;
    img.alt = vendor.name || 'Vendor image';
    card.appendChild(img);
  }

  const body = document.createElement('div');
  body.className = 'card-body';

  const h3 = document.createElement('h3');
  h3.textContent = vendor.name || 'Unknown Vendor';
  h3.style.display = 'flex';
  h3.style.gap = '8px';
  h3.style.alignItems = 'center';
  h3.appendChild(createBadge(vendor.status || vendor.state || 'unverified'));

  const addr = document.createElement('p');
  addr.className = 'meta';
  addr.textContent = vendor.address || '';

  const food = document.createElement('p');
  food.textContent = `${vendor.food_item || ''} — ${formatPrice(vendor.price_min)}`;

  const actions = document.createElement('div');
  actions.className = 'actions';

  const view = document.createElement('a');
  view.className = 'btn';
  view.href = `/vendors/${vendor.id || ''}`;
  view.textContent = 'View';

  const book = document.createElement('button');
  book.type = 'button';
  book.className = 'btn secondary wa-btn';
  const waNumber = toIntl(vendor.phone || '');
  const waText = `Booking request: Vendor: ${vendor.name || ''} | Location: ${vendor.address || ''}`;
  book.dataset.waNumber = waNumber;
  book.dataset.waMessage = waText;
  book.textContent = 'Book';

  actions.appendChild(view);
  actions.appendChild(book);

  body.appendChild(h3);
  body.appendChild(addr);
  body.appendChild(food);
  body.appendChild(actions);

  card.appendChild(body);
  return card;
}

function showLoading(message = 'Loading…') {
  if (!vendorsList) return;
  clearChildren(vendorsList);
  const el = document.createElement('div');
  el.className = 'card';
  el.style.textAlign = 'center';
  el.textContent = message;
  vendorsList.appendChild(el);
}

function showError(message = 'Unable to load vendors') {
  if (!vendorsList) return;
  clearChildren(vendorsList);
  const el = document.createElement('div');
  el.className = 'card';
  el.style.color = 'var(--danger, #c02828)';
  el.textContent = message;
  vendorsList.appendChild(el);
}

function showEmpty(message = 'No vendors found') {
  if (!vendorsList) return;
  clearChildren(vendorsList);
  const el = document.createElement('div');
  el.className = 'card';
  el.textContent = message;
  vendorsList.appendChild(el);
}

async function render(vendors) {
  if (!vendorsList) return;
  clearChildren(vendorsList);

  if (!vendors || vendors.length === 0) {
    showEmpty('No vendors yet. Try "Find vendors near me" or change the filter.');
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const v of vendors) {
    const card = createCard(v);
    fragment.appendChild(card);
  }
  vendorsList.appendChild(fragment);
}

async function loadAll() {
  if (!vendorsList) return;
  showLoading();
  try {
    const v = await fetchVendors();
    await render(v);
  } catch (err) {
    console.error('fetchVendors error', err);
    showError('Error loading vendors — check console for details.');
  }
}

async function findNearby(radiusKm = 5) {
  if (!vendorsList) return;
  showLoading('Searching near you…');
  try {
    const v = await getVendorsNearby(radiusKm);
    if (!v || v.length === 0) {
      showEmpty('No vendors found nearby. Try a larger radius or view all vendors.');
      return;
    }
    await render(v);
  } catch (err) {
    console.error('getVendorsNearby error', err);
    showError('Could not get nearby vendors. Showing all vendors instead.');
    await loadAll();
  }
}

/* Event wiring */
if (btnFind) {
  btnFind.addEventListener('click', async () => {
    btnFind.disabled = true;
    const prevText = btnFind.textContent;
    btnFind.textContent = 'Searching…';
    try {
      await findNearby(5);
    } finally {
      btnFind.disabled = false;
      btnFind.textContent = prevText;
    }
  });
}

if (filter) {
  filter.addEventListener('change', async () => {
    showLoading('Applying filter…');
    try {
      const all = await fetchVendors();
      const val = filter.value;
      const filtered = all.filter(x => (val === 'all' ? true : (x.status === val)));
      render(filtered);
    } catch (err) {
      console.error('filter error', err);
      showError('Error applying filter.');
    }
  });
}

/* Delegated handler for WhatsApp "Book" buttons (using data attributes) */
document.addEventListener('click', (ev) => {
  const btn = ev.target.closest('.wa-btn');
  if (!btn) return;
  const number = btn.dataset.waNumber;
  const text = btn.dataset.waMessage || '';
  const url = `https://wa.me/${encodeURIComponent(number)}?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank', 'noopener');
});

/* ---------------------------
   Page startup
   --------------------------- */
document.addEventListener('DOMContentLoaded', () => {
  // initial vendor list
  loadAll();

  // init WhatsApp behavior (if module exists)
  try { initWhatsApp({ debug: false }); } catch (err) { /* ignore */ }

  // init vendor signup if the config exists
  const cfg = readPageConfig();
  try {
    initVendorSignup(cfg);
  } catch (err) {
    console.warn('initVendorSignup failed', err);
  }
});

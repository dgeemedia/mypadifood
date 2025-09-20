// public/js/main.js
// Combined mobile drawer + focus-first-input + device-location helpers
// - Drawer is injected once and is accessible/keyboard-friendly
// - fillLocation(context) supports 'client' and 'vendor' forms (ids like client-latitude, vendor-latitude, etc.)
// - Reverse geocoding is attempted (best-effort) using Nominatim (no custom User-Agent header to avoid CORS issues)

document.addEventListener('DOMContentLoaded', () => {
  // Focus the first interactive field (not hidden)
  const firstInput = document.querySelector('input:not([type="hidden"]), textarea, select');
  if (firstInput) {
    try { firstInput.focus(); } catch (e) { /* ignore */ }
  }

  // MOBILE DRAWER
  const toggleBtn = document.getElementById('mobile-menu-toggle');
  const existingDrawer = document.getElementById('mobile-drawer');
  const drawerHtml = `
    <div class="mobile-drawer" id="mobile-drawer" aria-hidden="true" role="dialog" aria-label="Mobile menu">
      <div class="close-btn" style="display:flex; justify-content:flex-end;"><button id="mobile-drawer-close" aria-label="Close" class="btn">Close</button></div>
      <nav>
        <a href="/">Home</a>
        <a href="/client/login">Client Login</a>
        <a href="/client/register">Client Signup</a>
        <a href="/vendor/register">Vendor Register</a>
        <a href="/admin/login">Admin Login</a>
        <a href="/about">About</a>
        <a href="/contact">Contact</a>
      </nav>
    </div>
  `;

  if (!existingDrawer) {
    document.body.insertAdjacentHTML('beforeend', drawerHtml);
  }
  const drawer = document.getElementById('mobile-drawer');
  const closeBtn = document.getElementById('mobile-drawer-close');

  function openDrawer() {
    if (!drawer) return;
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'true');
    // move focus into the drawer for accessibility
    const firstLink = drawer.querySelector('a');
    if (firstLink) firstLink.focus();
  }

  function closeDrawer() {
    if (!drawer) return;
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'false');
    // return focus to toggle button for good UX
    if (toggleBtn) toggleBtn.focus();
  }

  if (toggleBtn) {
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = drawer && drawer.classList.contains('open');
      if (isOpen) closeDrawer();
      else openDrawer();
    });
  }

  if (closeBtn) closeBtn.addEventListener('click', (e) => {
    e.preventDefault();
    closeDrawer();
  });

  // Close when clicking outside drawer
  document.addEventListener('click', (e) => {
    if (!drawer || !drawer.classList.contains('open')) return;
    if (!e.target.closest('.mobile-drawer') && !e.target.closest('#mobile-menu-toggle')) {
      closeDrawer();
    }
  });

  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer && drawer.classList.contains('open')) {
      closeDrawer();
    }
  });

  // Close and allow navigation when a drawer link is clicked
  if (drawer) {
    drawer.addEventListener('click', (e) => {
      const a = e.target.closest('a');
      if (!a) return;
      // Close drawer first, then allow the navigation to proceed
      closeDrawer();
      // For single-page behaviors you might want to intercept; here we allow full navigation.
    });
  }

  // Location helper wiring for forms
  const vendorBtn = document.getElementById('vendor-use-location');
  if (vendorBtn) vendorBtn.addEventListener('click', (e) => fillLocation(e, 'vendor'));

  const clientBtn = document.getElementById('client-use-location');
  if (clientBtn) clientBtn.addEventListener('click', (e) => fillLocation(e, 'client'));
});

// fillLocation: tries to get device geolocation, fills latitude/longitude and attempts reverse geocode
async function fillLocation(event, context) {
  // context e.g. 'client' or 'vendor'
  const btn = event?.currentTarget || null;
  const originalText = btn ? btn.textContent : null;

  try {
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Locating…';
    }

    if (!('geolocation' in navigator)) {
      alert('Geolocation not supported by this browser. Please fill location manually.');
      return;
    }

    // get position
    const pos = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      });
    });

    const lat = pos.coords.latitude;
    const lon = pos.coords.longitude;

    const latitudeField = document.getElementById(`${context}-latitude`);
    const longitudeField = document.getElementById(`${context}-longitude`);
    const stateField = document.getElementById(`${context}-state`);
    const lgaField = document.getElementById(`${context}-lga`);
    const locSourceField = document.getElementById(`${context}-location-source`);
    const formEl = document.getElementById(`${context}-form`);

    if (latitudeField) latitudeField.value = lat;
    if (longitudeField) longitudeField.value = lon;
    if (locSourceField) locSourceField.value = 'device';

    // ensure hidden input exists if form present
    if (formEl && !formEl.querySelector('input[name="location_source"]')) {
      const hidden = document.createElement('input');
      hidden.type = 'hidden';
      hidden.name = 'location_source';
      hidden.value = 'device';
      formEl.appendChild(hidden);
    }

    // best-effort reverse geocode via Nominatim (may be rate-limited; client-side calls might be blocked by CORS/policy)
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;
      const resp = await fetch(url, {
        headers: { 'Accept': 'application/json' }
      });

      if (!resp.ok) throw new Error(`Reverse geocode HTTP ${resp.status}`);
      const data = await resp.json();
      const addr = data.address || {};
      const foundState = addr.state || addr.region || '';
      // Common LGA-like fields: county, city_district, town, suburb
      const foundLga = addr.county || addr.city_district || addr.town || addr.suburb || '';

      if (stateField && foundState) {
        // If stateField is a SELECT, try to match option; otherwise set value
        if (stateField.tagName === 'SELECT') {
          const opt = Array.from(stateField.options).find(o => o.value && o.value.toLowerCase() === foundState.toLowerCase());
          if (opt) stateField.value = opt.value;
          else {
            // add a temporary option if it doesn't exist
            const tmp = document.createElement('option');
            tmp.value = foundState;
            tmp.text = foundState;
            stateField.appendChild(tmp);
            stateField.value = foundState;
          }
        } else {
          stateField.value = foundState;
        }
      }

      if (lgaField && foundLga) {
        if (lgaField.tagName === 'SELECT') {
          const opt2 = Array.from(lgaField.options).find(o => o.value && o.value.toLowerCase() === foundLga.toLowerCase());
          if (opt2) lgaField.value = opt2.value;
          else {
            const tmp2 = document.createElement('option');
            tmp2.value = foundLga;
            tmp2.text = foundLga;
            lgaField.appendChild(tmp2);
            lgaField.value = foundLga;
          }
        } else {
          lgaField.value = foundLga;
        }
      }
    } catch (revErr) {
      // Non-fatal: we tried reverse geocoding — user can still fill manually
      // Avoid spamming the user; show a single gentle alert
      console.warn('Reverse geocode failed:', revErr);
      // Only notify if explicit button used (btn present)
      if (btn) {
        // small non-blocking message via alert is acceptable here; you could replace with in-page UI later
        // but do not throw.
        // alert('Could not translate coordinates to state/LGA automatically. Please fill them manually.');
      }
    }
  } catch (err) {
    console.error('Geolocation error', err);
    // show user-friendly message
    alert('Could not access your device location. Please enter state/LGA manually (permission denied or timeout).');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = originalText || 'Use my device location';
    }
  }
}

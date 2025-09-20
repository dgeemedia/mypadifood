// public/js/main.js
document.addEventListener('DOMContentLoaded', () => {
  const firstInput = document.querySelector('input, textarea');
  if (firstInput) firstInput.focus();

  const vendorBtn = document.getElementById('vendor-use-location');
  if (vendorBtn) vendorBtn.addEventListener('click', (e) => fillLocation(e, 'vendor'));

  const clientBtn = document.getElementById('client-use-location');
  if (clientBtn) clientBtn.addEventListener('click', (e) => fillLocation(e, 'client'));
});

async function fillLocation(event, context) {
  // `event` might be undefined if the function is called programmatically.
  const btn = event?.currentTarget || null;
  const origText = btn ? btn.textContent : null;
  try {
    if (btn) btn.textContent = 'Locating...';

    if (!navigator.geolocation) {
      alert('Geolocation not supported by your browser. Please fill location manually.');
      return;
    }

    // get position (wrapped as a promise)
    const pos = await new Promise((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000 })
    );

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

    // Optional: append location_source hidden input if not present
    if (formEl && !formEl.querySelector('input[name="location_source"]')) {
      const h = document.createElement('input');
      h.type = 'hidden';
      h.name = 'location_source';
      h.value = 'device';
      formEl.appendChild(h);
    }

    // Reverse geocode to get state/LGA (best-effort)
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`;
      const resp = await fetch(url, {
        headers: { 'Accept': 'application/json', 'User-Agent': 'MyPadiFood/1.0 (contact@example.com)' }
      });
      if (!resp.ok) throw new Error(`Reverse geocode failed: ${resp.status}`);
      const data = await resp.json();
      const addr = data.address || {};
      const state = addr.state || addr.region || '';
      const lga = addr.county || addr.city_district || addr.town || addr.suburb || '';

      if (stateField && state) {
        if (stateField.tagName === 'SELECT') {
          const opt = Array.from(stateField.options).find(o => o.value.toLowerCase() === state.toLowerCase());
          if (opt) stateField.value = opt.value;
          else {
            const tmp = document.createElement('option');
            tmp.value = state;
            tmp.text = state;
            stateField.appendChild(tmp);
            stateField.value = state;
          }
        } else {
          stateField.value = state;
        }
      }

      if (lgaField && lga) lgaField.value = lga;
    } catch (err) {
      console.error('Reverse geocode error', err);
      // non-fatal: user can fill manually
      // don't repeatedly alert — only do once
      alert('Could not translate location automatically — please fill manually.');
    }
  } catch (err) {
    console.error('Geolocation error', err);
    alert('Could not access location. Please enter state/LGA manually (permission denied or timeout).');
  } finally {
    if (btn) btn.textContent = origText || 'Use my device location';
  }
}

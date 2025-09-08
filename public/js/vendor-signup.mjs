// public/js/vendor-signup.mjs
// ES module: exported initializer for vendor signup UI
export function initVendorSignup(config = {}) {
  // only run if the form exists on the page
  const vendorForm = document.getElementById('vendorForm');
  if (!vendorForm) return null;

  const states = config.states || {};
  const mapboxToken = config.mapboxToken || '';

  const stateSelect = document.getElementById('stateSelect');
  const lgaSelect = document.getElementById('lgaSelect');
  const addressInput = document.getElementById('addressInput');
  const previewBtn = document.getElementById('previewBtn');
  const previewSection = document.getElementById('mapPreview');
  const previewImg = document.getElementById('previewImg');
  const coordsText = document.getElementById('coordsText');
  const coordsSmall = document.getElementById('coordsSmall');
  const latInput = document.getElementById('latInput');
  const lngInput = document.getElementById('lngInput');
  const autoLocate = document.getElementById('autoLocate');
  const agree = document.getElementById('agree');
  const submitBtn = document.getElementById('submitBtn');

  function populateLgas() {
    if (!stateSelect || !lgaSelect) return;
    const s = stateSelect.value;
    let lgas = [];
    if (states && states[s]) lgas = states[s];
    if (Array.isArray(states)) {
      const match = states.find(st => st.state === s);
      if (match) lgas = match.lgas;
    }
    lgaSelect.innerHTML =
      '<option value="">Select LGA</option>' +
      lgas.map(l => `<option value="${l}">${l}</option>`).join('');
  }

  function refreshSubmitState() {
    const hasCoords = latInput && latInput.value && lngInput && lngInput.value;
    if (submitBtn) submitBtn.disabled = !(agree && agree.checked && hasCoords);
  }

  let geocodeTimer = null;
  function debounceGeocode(fn, wait = 350) {
    if (geocodeTimer) clearTimeout(geocodeTimer);
    geocodeTimer = setTimeout(fn, wait);
  }

  async function geocode(query) {
    if (!mapboxToken) throw new Error('Mapbox token not configured');
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${mapboxToken}&limit=1`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('Geocode request failed');
    const json = await res.json();
    const feat = (json && json.features && json.features[0]) || null;
    if (!feat) return null;
    return { lng: feat.center[0], lat: feat.center[1], place: feat.place_name };
  }

  function staticMapUrl(lat, lng) {
    if (!mapboxToken) return '';
    const marker = `pin-s+ff0000(${lng},${lat})`;
    return `https://api.mapbox.com/styles/v1/mapbox/streets-v11/static/${marker}/${lng},${lat},14,0/600x350?access_token=${mapboxToken}`;
  }

  if (previewBtn) {
    previewBtn.addEventListener('click', async () => {
      const countryEl = document.getElementById('countrySelect');
      const country = countryEl ? countryEl.value : '';
      const lga = lgaSelect ? lgaSelect.value : '';
      const state = stateSelect ? stateSelect.value : '';
      const address = addressInput ? addressInput.value : '';
      const query = address && address.trim().length > 0
        ? `${address}, ${lga || ''}, ${state || ''}, ${country || ''}`
        : `${lga || ''} ${state || ''} ${country || ''}`;

      if (coordsText) coordsText.textContent = 'Looking up…';
      if (previewSection) previewSection.hidden = false;

      try {
        const coords = await geocode(query);
        if (!coords) {
          if (coordsText) coordsText.textContent = 'Location not found — try a more specific address.';
          if (previewImg) previewImg.src = '';
          if (latInput) latInput.value = '';
          if (lngInput) lngInput.value = '';
          if (coordsSmall) coordsSmall.textContent = 'None';
          refreshSubmitState();
          return;
        }

        if (previewImg) previewImg.src = staticMapUrl(coords.lat, coords.lng);
        if (coordsText) coordsText.textContent = coords.place || `Lat: ${coords.lat.toFixed(6)} Lng: ${coords.lng.toFixed(6)}`;
        if (coordsSmall) coordsSmall.textContent = `${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`;
        if (latInput) latInput.value = coords.lat;
        if (lngInput) lngInput.value = coords.lng;
        refreshSubmitState();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('geocode error', err);
        if (coordsText) coordsText.textContent = 'Geocode failed — try again later.';
      }
    });
  }

  if (autoLocate) {
    autoLocate.addEventListener('click', async () => {
      if (!navigator.geolocation) {
        alert('Geolocation not supported in this browser.');
        return;
      }
      autoLocate.disabled = true;
      autoLocate.textContent = 'Detecting…';
      try {
        const pos = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000 }));
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        if (previewImg) previewImg.src = staticMapUrl(lat, lng);
        if (coordsText) coordsText.textContent = `Detected location — Lat: ${lat.toFixed(6)} Lng: ${lng.toFixed(6)}`;
        if (coordsSmall) coordsSmall.textContent = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        if (latInput) latInput.value = lat;
        if (lngInput) lngInput.value = lng;
        if (previewSection) previewSection.hidden = false;
        refreshSubmitState();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('geolocation failed', err);
        alert('Could not detect your location. Please try Preview on map or enter a precise address.');
      } finally {
        autoLocate.disabled = false;
        autoLocate.textContent = 'Auto-locate me';
      }
    });
  }

  if (stateSelect) stateSelect.addEventListener('change', populateLgas);
  if (agree) agree.addEventListener('change', refreshSubmitState);

  if (addressInput) {
    addressInput.addEventListener('input', () => debounceGeocode(() => {
      if (coordsText) coordsText.textContent = 'Press "Preview on map" to confirm location.';
      if (previewSection) previewSection.hidden = false;
    }, 400));
  }

  if (vendorForm) {
    vendorForm.addEventListener('submit', (ev) => {
      const latVal = latInput ? latInput.value : '';
      const lngVal = lngInput ? lngInput.value : '';
      if (!latVal || !lngVal) {
        ev.preventDefault();
        alert('Please confirm your location by clicking "Preview on map" or "Auto-locate me" before submitting.');
        return;
      }
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Submitting…';
      }
    });
  }

  // init
  (function init() {
    if (stateSelect && stateSelect.value) populateLgas();
    refreshSubmitState();
  })();

  return { populateLgas, refreshSubmitState };
}

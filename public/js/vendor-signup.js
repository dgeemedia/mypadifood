// public/js/vendor-signup.js
(function () {
  const P = window.PADI || {};
  const states = P.states || {};
  const mapboxToken = P.mapboxToken || '';

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
  const vendorForm = document.getElementById('vendorForm');

  function populateLgas() {
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

  // enable/disable submit according to consent + coords presence
  function refreshSubmitState() {
    const hasCoords = latInput.value && lngInput.value;
    submitBtn.disabled = !(agree.checked && hasCoords);
  }

  // debounced geocode
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

  previewBtn.addEventListener('click', async () => {
    const country = document.getElementById('countrySelect').value;
    const lga = lgaSelect.value;
    const state = stateSelect.value;
    const address = addressInput.value;
    const query = address && address.trim().length > 0
      ? `${address}, ${lga || ''}, ${state || ''}, ${country || ''}`
      : `${lga || ''} ${state || ''} ${country || ''}`;

    coordsText.textContent = 'Looking up…';
    previewSection.hidden = false;
    try {
      const coords = await geocode(query);
      if (!coords) {
        coordsText.textContent = 'Location not found — try a more specific address.';
        previewImg.src = '';
        latInput.value = '';
        lngInput.value = '';
        coordsSmall.textContent = 'None';
        refreshSubmitState();
        return;
      }

      previewImg.src = staticMapUrl(coords.lat, coords.lng);
      coordsText.textContent = coords.place || `Lat: ${coords.lat.toFixed(6)} Lng: ${coords.lng.toFixed(6)}`;
      coordsSmall.textContent = `${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`;
      latInput.value = coords.lat;
      lngInput.value = coords.lng;
      refreshSubmitState();
    } catch (err) {
      console.error('geocode error', err);
      coordsText.textContent = 'Geocode failed — try again later.';
    }
  });

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
      previewImg.src = staticMapUrl(lat, lng);
      coordsText.textContent = `Detected location — Lat: ${lat.toFixed(6)} Lng: ${lng.toFixed(6)}`;
      coordsSmall.textContent = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      latInput.value = lat;
      lngInput.value = lng;
      previewSection.hidden = false;
      refreshSubmitState();
    } catch (err) {
      console.warn('geolocation failed', err);
      alert('Could not detect your location. Please try Preview on map or enter a precise address.');
    } finally {
      autoLocate.disabled = false;
      autoLocate.textContent = 'Auto-locate me';
    }
  });

  // populate LGAs when state changes
  stateSelect.addEventListener('change', populateLgas);

  // realtime toggle for submit
  agree.addEventListener('change', refreshSubmitState);

  // graceful address typing -> optional live preview
  addressInput.addEventListener('input', () => debounceGeocode(() => {
    // don't automatically run geocode here (avoid API cost), just hint to user to click Preview
    // but we update small hint:
    coordsText.textContent = 'Press "Preview on map" to confirm location.';
    previewSection.hidden = false;
  }, 400));

  // basic client validation on submit (double-check coords exist)
  vendorForm.addEventListener('submit', (ev) => {
    if (!latInput.value || !lngInput.value) {
      ev.preventDefault();
      alert('Please confirm your location by clicking "Preview on map" or "Auto-locate me" before submitting.');
      return;
    }
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting…';
  });

  // init: populate LGAs if state pre-selected
  (function init() {
    if (stateSelect.value) populateLgas();
    refreshSubmitState();
  })();

})();

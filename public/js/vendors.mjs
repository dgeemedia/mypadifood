// public/js/vendors.mjs
const DEFAULT_TIMEOUT = 7000;

async function fetchWithTimeout(url, opts = {}, timeout = DEFAULT_TIMEOUT) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

export async function fetchVendors() {
  try {
    const res = await fetchWithTimeout('/vendors');
    if (!res.ok) {
      console.warn('fetchVendors non-OK', res.status);
      return [];
    }
    try {
      return await res.json();
    } catch (e) {
      console.warn('fetchVendors JSON parse error', e);
      return [];
    }
  } catch (err) {
    console.warn('fetchVendors failed', err?.message || err);
    return [];
  }
}

function getCurrentPosition(options = { enableHighAccuracy: false, timeout: 6000, maximumAge: 0 }) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Geolocation not supported'));
    navigator.geolocation.getCurrentPosition(resolve, (err) => reject(err), options);
  });
}

export async function getVendorsNearby(km = 5) {
  try {
    const pos = await getCurrentPosition();
    const lat = pos.coords.latitude.toFixed(6);
    const lng = pos.coords.longitude.toFixed(6);

    // Basic validation
    if (Number.isNaN(Number(lat)) || Number.isNaN(Number(lng))) throw new Error('Invalid coords');

    const url = `/vendors?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}&radius=${encodeURIComponent(km)}`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) {
      console.warn('getVendorsNearby non-OK', res.status);
      return fetchVendors();
    }
    try {
      return await res.json();
    } catch (e) {
      console.warn('getVendorsNearby JSON parse error', e);
      return fetchVendors();
    }
  } catch (err) {
    // user denied permission or geolocation failed -> fallback to full fetch
    console.warn('getVendorsNearby fallback', err?.message || err);
    return fetchVendors();
  }
}

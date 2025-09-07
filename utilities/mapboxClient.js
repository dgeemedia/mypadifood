const axios = require('axios');

exports.geocode = async (text) => {
  try {
    const token = process.env.MAPBOX_TOKEN;
    if (!token) return { lat: null, lng: null };
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(text)}.json?access_token=${token}&limit=1`;
    const r = await axios.get(url);
    const f = r.data.features && r.data.features[0];
    if (!f) return { lat: null, lng: null };
    return { lng: f.center[0], lat: f.center[1] };
  } catch (err) {
    console.error('geocode error', err.message);
    return { lat: null, lng: null };
  }
};

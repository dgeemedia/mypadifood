// controllers/vendorsController.js
const Vendor = require('../models/vendorModel');
const mapbox = require('../utilities/mapboxClient');
const sendAdminEmail = require('../utilities/smsEmail');
const geoUtil = require('../utilities/geo');

function safeFlash(req) {
  // If connect-flash or similar is present, returning req.flash() can be used in templates.
  try {
    if (req && typeof req.flash === 'function') {
      return req.flash();
    }
  } catch (e) {
    // ignore
  }
  return null;
}

exports.list = async (req, res) => {
  const { lat, lng, radius = 5, verified_only = 'true', country } = req.query;
  try {
    let vendors = await Vendor.getAll({ verified_only: verified_only === 'true' });

    if (country) {
      vendors = vendors.filter(v => v.country && v.country.toLowerCase() === String(country).toLowerCase());
    }

    if (lat && lng) {
      const latN = Number(lat);
      const lngN = Number(lng);
      const radN = Number(radius) || 5;
      vendors = vendors.filter(v => {
        if (!v.lat || !v.lng) return false;
        const d = geoUtil.distanceKm(latN, lngN, Number(v.lat), Number(v.lng));
        return d <= radN;
      });
      // Optionally sort by distance (if you compute distance here)
    }

    // hide phone before sending to public
    vendors = vendors.map(v => ({ ...v, phone: undefined }));

    res.json(vendors);
  } catch (err) {
    console.error('vendorsController.list error:', err);
    res.status(500).json({ error: 'server_error' });
  }
};

exports.showForm = (req, res) => {
  try {
    const states = require('../data/nigeria_states_lgas.json'); // object or array depending on your JSON
    const mapboxToken = process.env.MAPBOX_TOKEN || '';
    const flash = safeFlash(req);
    res.render('vendor_signup', {
      title: 'Vendor Enrollment',
      states,
      mapboxToken,
      flash
    });
  } catch (err) {
    console.error('vendorsController.showForm error:', err);
    res.status(500).send('Server error');
  }
};

exports.create = async (req, res) => {
  try {
    // collect and sanitize inputs
    const {
      name,
      address,
      state,
      lga,
      country = 'Nigeria',
      food_item,
      price_min,
      email,
      phone,
      business_type,
      lat: latFromForm,
      lng: lngFromForm
    } = req.body;

    // basic required validation (name, address, food_item, price_min)
    if (!name || !address || !food_item || !price_min) {
      if (typeof req.flash === 'function') req.flash('error', 'Please fill all required fields.');
      return res.status(400).render('vendor_signup', {
        title: 'Vendor Enrollment',
        states: require('../data/nigeria_states_lgas.json'),
        mapboxToken: process.env.MAPBOX_TOKEN || '',
        flash: safeFlash(req),
        // optionally re-populate previously entered fields to help user
        formData: req.body
      });
    }

    // Prefer lat/lng provided by client (from preview/auto-locate). If absent, try server-side geocode.
    let lat = latFromForm || null;
    let lng = lngFromForm || null;
    if ((!lat || !lng) && address) {
      try {
        const geocodeInput = address && String(address).trim().length ? address : `${lga || ''} ${state || ''} ${country || ''}`.trim();
        const coords = await mapbox.geocode(geocodeInput);
        if (coords && typeof coords.lat === 'number' && typeof coords.lng === 'number') {
          lat = coords.lat;
          lng = coords.lng;
        } else {
          // geocode returned no results — keep coords null
          lat = null;
          lng = null;
        }
      } catch (geErr) {
        console.warn('Mapbox geocode failed (create vendor):', geErr?.message || geErr);
        lat = null;
        lng = null;
      }
    }

    const price = price_min ? parseInt(price_min, 10) : null;

    const userId = req.session && req.session.user ? req.session.user.id : null;

    const vendorPayload = {
      user_id: userId,
      name: String(name).trim(),
      address: String(address).trim(),
      country: country || 'Nigeria',
      lat: lat !== null ? Number(lat) : null,
      lng: lng !== null ? Number(lng) : null,
      food_item: food_item ? String(food_item).trim() : null,
      price_min: Number.isFinite(price) ? price : null,
      email: email ? String(email).trim() : null,
      phone: phone ? String(phone).trim() : null,
      business_type: business_type ? String(business_type).trim() : null,
      status: 'unverified'
    };

    const vendor = await Vendor.create(vendorPayload);

    // best-effort admin notification (email or SMS)
    try {
      await sendAdminEmail(
        `New vendor signup: ${vendor.name}`,
        `Vendor ${vendor.name} signed up at ${vendor.address}. Vendor ID: ${vendor.id}`
      );
    } catch (notifyErr) {
      console.warn('sendAdminEmail failed:', notifyErr?.message || notifyErr);
    }

    // set flash if available
    if (typeof req.flash === 'function') {
      req.flash('success', `Thanks ${vendor.name}. Your enrollment is received and is ${vendor.status}.`);
    }

    // render a simple thank-you/confirmation page
    return res.render('vendor_thanks', {
      title: 'Thank you',
      vendor: { id: vendor.id, name: vendor.name, address: vendor.address, status: vendor.status },
      flash: safeFlash(req)
    });

  } catch (err) {
    console.error('vendorsController.create error:', err);
    if (typeof req.flash === 'function') req.flash('error', 'Server error while creating vendor. Please try again.');
    return res.status(500).redirect('/vendors/new');
  }
};

exports.get = async (req, res) => {
  try {
    const vendor = await Vendor.getById(req.params.id);
    if (!vendor) return res.status(404).send('Not found');
    const safeVendor = { ...vendor, phone: undefined }; // hide phone
    res.render('vendor', { title: vendor.name, vendor: safeVendor });
  } catch (err) {
    console.error('vendorsController.get error:', err);
    res.status(500).send('Server error');
  }
};

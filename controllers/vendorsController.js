// controllers/vendorsController.js
const Vendor = require('../models/vendorModel');
const mapbox = require('../utilities/mapboxClient');
const sendAdminEmail = require('../utilities/smsEmail');

exports.list = async (req, res) => {
  const { lat, lng, radius = 5, verified_only = 'true' } = req.query;
  try {
    let vendors = await Vendor.getAll({ verified_only: verified_only === 'true' });
    if (lat && lng) {
      vendors = vendors.filter(v => {
        if (!v.lat || !v.lng) return false;
        const d = require('../utilities/geo').distanceKm(Number(lat), Number(lng), Number(v.lat), Number(v.lng));
        return d <= Number(radius);
      });
    }
    // hide phone before sending
    vendors = vendors.map(v => ({ ...v, phone: undefined }));
    res.json(vendors);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server' });
  }
};

exports.showForm = (req, res) => {
  const states = require('../data/nigeria_states_lgas.json');
  res.render('vendor_signup', { title: 'Join as vendor', states });
};

// inside controllers/vendorsController.js (replace exports.create)
exports.create = async (req, res) => {
  try {
    const { name, address, state, lga, food_item, price_min, email, phone, business_type } = req.body;

    // Attach logged-in user's id if available (so vendor can be linked to account)
    const userId = req.session && req.session.user ? req.session.user.id : null;

    // Prepare address for geocoding - prefer explicit address, else use LGA+State
    const geocodeInput = address && address.trim().length > 0 ? address : `${lga || ''} ${state || ''}`.trim();

    // geocode address
    const coords = await mapbox.geocode(geocodeInput);

    // Ensure price_min is integer (or null)
    const price = price_min ? parseInt(price_min, 10) : null;

    const vendorPayload = {
      user_id: userId,
      name,
      address,
      lat: coords.lat,
      lng: coords.lng,
      food_item,
      price_min: price,
      email,
      phone,
      business_type: business_type || null,
      status: 'unverified'
    };

    const vendor = await Vendor.create(vendorPayload);

    // notify admin (internal routing/email)
    await sendAdminEmail(
      `New vendor signup: ${vendor.name}`,
      `Vendor ${vendor.name} signed up at ${vendor.address}. Vendor ID: ${vendor.id}`
    );

    // render a thank-you/confirmation page
    return res.render('vendor_thanks', {
      title: 'Thank you',
      vendor: { id: vendor.id, name: vendor.name, address: vendor.address, status: vendor.status }
    });
  } catch (err) {
    console.error('vendorsController.create error:', err);
    res.status(500).send('Server error');
  }
};

exports.get = async (req, res) => {
  try {
    const vendor = await Vendor.getById(req.params.id);
    if (!vendor) return res.status(404).send('Not found');
    const safeVendor = { ...vendor, phone: undefined };
    res.render('vendor', { title: vendor.name, vendor: safeVendor });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
};

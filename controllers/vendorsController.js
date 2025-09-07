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
        const d = require('../utilities/geo').distanceKm(lat, lng, v.lat, v.lng);
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

exports.create = async (req, res) => {
  try {
    const { name, address, state, lga, food_item, price_min, email, phone } = req.body;
    // geocode address
    const coords = await mapbox.geocode(address || `${lga || ''}, ${state || ''}`);
    const vendor = await Vendor.create({ name, address, lat: coords.lat, lng: coords.lng, food_item, price_min, email, phone, status: 'unverified' });
    // notify admin
    await sendAdminEmail(`New vendor signup: ${vendor.name}`, `Vendor ${vendor.name} signed up at ${vendor.address}`);
    res.redirect('/');
  } catch (err) {
    console.error(err);
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

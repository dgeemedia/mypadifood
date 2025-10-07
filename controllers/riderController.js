// controllers/riderController.js
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const SALT_ROUNDS = 10;

const models = require('../models');
const riderModel = models.rider;

function loadStatesLGAs() {
  try {
    const file = path.join(__dirname, '..', 'locations', 'Nigeria-State-Lga.json');
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.error('Could not load statesLGAs:', e);
  }
  return [];
}

// GET /rider/register
exports.showRegisterForm = (req, res) => {
  const statesLGAs = loadStatesLGAs();

  const locals = req.session.form_data || {};
  const errors = req.session.form_errors || null;
  if (req.session.form_data) delete req.session.form_data;
  if (req.session.form_errors) delete req.session.form_errors;

  return res.render('rider/register', { statesLGAs, locals, errors });
};

// POST /rider/register
exports.register = async (req, res) => {
  try {
    const {
      full_name, email, phone, state, lga, address,
      vehicle_type, vehicle_number, bank_name, account_number,
      password, id_type, id_number, next_of_kin, base_fee,
      latitude, longitude, location_source
    } = req.body;

    // multer supplied file (if any)
    let idFilePath = null;
    if (req.file && req.file.path) {
      // store relative path (project-root relative)
      idFilePath = path.relative(path.join(__dirname, '..'), req.file.path);
    }

    const hash = await bcrypt.hash(password, SALT_ROUNDS);

    const riderId = await riderModel.createRider({
      full_name, email, phone, state, lga, address,
      vehicle_type, vehicle_number, bank_name, account_number,
      password_hash: hash,
      id_type, id_number, id_file: idFilePath, next_of_kin,
      base_fee: base_fee ? Number(base_fee) : null,
      latitude: latitude || null,
      longitude: longitude || null,
      location_source: location_source || 'manual'
    });

    req.session.rider_thanks_id = riderId;
    return res.redirect('/rider/thanks');
  } catch (err) {
    console.error('Error submitting rider registration:', err);
    req.session.error = 'Error submitting rider registration.';
    return res.redirect('/rider/register');
  }
};

// GET /rider/thanks
exports.thanksPage = async (req, res) => {
  try {
    const riderId = req.session.rider_thanks_id;
    if (!riderId) {
      req.session.error = 'Unable to show confirmation page.';
      return res.redirect('/rider/register');
    }
    delete req.session.rider_thanks_id;
    let rider = null;
    try { rider = await riderModel.findById(riderId); } catch (e) { rider = null; }
    if (!rider) {
      req.session.success = 'Rider registration submitted. Await admin approval.';
      return res.render('rider/thanks', { rider: { id: riderId, full_name: 'Rider', status: 'pending' } });
    }
    req.session.success = 'Rider registration submitted. Await admin approval.';
    return res.render('rider/thanks', { rider });
  } catch (err) {
    console.error('Error rendering rider thanks page:', err);
    req.session.error = 'Could not show confirmation page.';
    return res.redirect('/');
  }
};

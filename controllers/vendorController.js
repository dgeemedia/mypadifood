// controllers/vendorController.js - vendor registration and related logic
const { pool } = require('../database/database');
const path = require('path');
const fs = require('fs');

const locationFile = path.join(__dirname, '..', 'locations', 'Nigeria-State-Lga.json');
let statesLGAs = [];
if (fs.existsSync(locationFile)) statesLGAs = JSON.parse(fs.readFileSync(locationFile, 'utf8'));

exports.showRegisterForm = (req, res) => res.render('vendor-register', { statesLGAs });

exports.register = async (req, res) => {
  const {
    name, state, lga, address, phone, email, food_item, base_price,
    latitude, longitude, location_source
  } = req.body;

  try {
    await pool.query(
      `INSERT INTO vendors (
         name, state, lga, address, phone, email, food_item, base_price, status, latitude, longitude, location_source
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending',$9,$10,$11)`,
      [name, state, lga, address, phone, email, food_item, base_price || null, latitude || null, longitude || null, location_source || 'manual']
    );
    req.session.success = 'Vendor registration submitted. Await admin approval.';
    res.redirect('/');
  } catch (err) {
    console.error(err);
    req.session.error = 'Error submitting vendor registration.';
    res.redirect('/vendor/register');
}
};
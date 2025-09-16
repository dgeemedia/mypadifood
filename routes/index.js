// routes/index.js
// Homepage: list approved vendors (with optional filters).
// Vendor detail page at /vendor/:id

const express = require('express');
const router = express.Router();

const models = require('../models');
const vendorModel = models.vendor;

/**
 * GET /
 * Query params: state, lga, q
 * Renders views/index.ejs with { vendors, filters }
 */
router.get('/', async (req, res) => {
  const { state, lga, q } = req.query;
  try {
    const vendors = await vendorModel.getApprovedVendors({ state, lga, q });
    return res.render('index', { vendors, filters: { state, lga, q } });
  } catch (err) {
    console.error('Error fetching vendors:', err);
    return res.render('index', { vendors: [], filters: {} });
  }
});

/**
 * GET /vendor/:id
 * Show vendor detail view (vendor.ejs)
 */
router.get('/vendor/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const vendor = await vendorModel.findById(id);
    if (!vendor) {
      req.session.error = 'Vendor not found';
      return res.redirect('/');
    }
    return res.render('vendor', { vendor });
  } catch (err) {
    console.error('Error loading vendor:', err);
    req.session.error = 'Error loading vendor';
    return res.redirect('/');
  }
});

module.exports = router;

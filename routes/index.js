// routes/index.js
const express = require('express');
const router = express.Router();

const models = require('../models');
const vendorModel = models.vendor;

// Home — show approved vendors (basic) with optional filters
router.get('/', async (req, res) => {
  try {
    // read filters from query string
    const q = req.query.q ? String(req.query.q).trim() : null;
    const state = req.query.state ? String(req.query.state).trim() : null;
    const lga = req.query.lga ? String(req.query.lga).trim() : null;

    // fetch vendors using vendorModel's filter support
    const vendors = await vendorModel.getApprovedVendors({ state, lga, q });

    // pass filters to the template so inputs can keep state
    const filters = { q: q || '', state: state || '', lga: lga || '' };

    res.render('index', { vendors, filters });
  } catch (err) {
    console.error('Error rendering home:', err);
    res.status(500).send('Server error');
  }
});

// Only match UUIDs for vendor detail routes so literal paths like /vendor/register
// do not get interpreted as an :id param.
const uuidPattern = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';

router.get(`/vendor/:id(${uuidPattern})`, async (req, res) => {
  try {
    const { id } = req.params;
    const vendor = await vendorModel.findById(id);
    if (!vendor) {
      return res.status(404).render('404', { message: 'Vendor not found' });
    }
    res.render('vendor-detail', { vendor });
  } catch (err) {
    console.error('Error loading vendor detail:', err);
    res.status(500).send('Server error');
  }
});

module.exports = router;

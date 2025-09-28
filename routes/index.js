// routes/index.js
const express = require('express');
const router = express.Router();

const models = require('../models');
const vendorModel = models.vendor;

// Home
router.get('/', async (req, res) => {
  try {
    const q = req.query.q ? String(req.query.q).trim() : null;
    const state = req.query.state ? String(req.query.state).trim() : null;
    const lga = req.query.lga ? String(req.query.lga).trim() : null;

    const vendors = await vendorModel.getApprovedVendors({ state, lga, q });

    const filters = { q: q || '', state: state || '', lga: lga || '' };

    res.render('index', { vendors, filters });
  } catch (err) {
    console.error('Error rendering home:', err);
    res.status(500).send('Server error');
  }
});

const uuidPattern =
  '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';

router.get(`/vendor/:id(${uuidPattern})`, async (req, res) => {
  try {
    const { id } = req.params;
    const vendor = await vendorModel.findById(id);
    if (!vendor) {
      return res.status(404).render('404', { message: 'Vendor not found' });
    }
    res.render('vendor/detail', { vendor });
  } catch (err) {
    console.error('Error loading vendor detail:', err);
    res.status(500).send('Server error');
  }
});

// Footer / static pages
router.get('/about', (req, res) => res.render('pages/about'));
router.get('/contact', (req, res) => res.render('pages/contact'));
router.get('/careers', (req, res) => res.render('pages/careers'));
router.get('/support', (req, res) => res.render('pages/support'));
router.get('/terms', (req, res) => res.render('pages/terms'));
router.get('/privacy', (req, res) => res.render('pages/privacy'));

module.exports = router;

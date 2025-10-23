// routes/index.js
const express = require('express');
const router = express.Router();

const models = require('../models');
const vendorModel = models.vendor;
const reviewModel = models.review; // added

// Home
router.get('/', async (req, res) => {
  try {
    const q = req.query.q ? String(req.query.q).trim() : null;
    const state = req.query.state ? String(req.query.state).trim() : null;
    const lga = req.query.lga ? String(req.query.lga).trim() : null;

    const vendors = await vendorModel.getApprovedVendors({ state, lga, q });

    const filters = { q: q || '', state: state || '', lga: lga || '' };

    // Attach review summary to each vendor (review_count + avg_rating)
    let vendorsWithSummaries = vendors;
    if (vendors && vendors.length) {
      try {
        vendorsWithSummaries = await Promise.all(
          vendors.map(async (v) => {
            try {
              const sum = await reviewModel.getRatingSummaryForVendor(v.id);
              return Object.assign({}, v, { reviewsSummary: sum || { review_count: 0, avg_rating: 0 } });
            } catch (e) {
              // non-fatal: return vendor without summary on error
              console.warn('Could not load review summary for vendor', v.id, e);
              return Object.assign({}, v, { reviewsSummary: { review_count: 0, avg_rating: 0 } });
            }
          })
        );
      } catch (e) {
        console.warn('Could not fetch review summaries for vendor list', e);
        vendorsWithSummaries = vendors;
      }
    }

    res.render('index', { vendors: vendorsWithSummaries, filters });
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

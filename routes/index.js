// routes/index.js
const express = require('express');
const router = express.Router();

const models = require('../models');
const vendorModel = models.vendor;
const reviewModel = models.review || require('../models/reviewModel'); // guard if exported differently
const partnerModel = models.partner || require('../models/partnerModel');
const testimonialModel =
  models.testimonial || require('../models/testimonialModel');

// avatar helper for testimonial avatars
const avatarUtil = require('../utils/avatar');

// Home
router.get('/', async (req, res) => {
  try {
    const q = req.query.q ? String(req.query.q).trim() : null;
    const state = req.query.state ? String(req.query.state).trim() : null;
    const lga = req.query.lga ? String(req.query.lga).trim() : null;

    // fetch vendors (approved)
    const vendors = await vendorModel.getApprovedVendors({ state, lga, q });

    // Add review summaries for each vendor if review model exists
    let vendorsWithSummaries = vendors;
    if (
      vendors &&
      vendors.length &&
      reviewModel &&
      typeof reviewModel.getRatingSummaryForVendor === 'function'
    ) {
      try {
        vendorsWithSummaries = await Promise.all(
          vendors.map(async (v) => {
            try {
              const sum = await reviewModel.getRatingSummaryForVendor(v.id);
              return Object.assign({}, v, {
                reviewsSummary: sum || { review_count: 0, avg_rating: 0 },
              });
            } catch (e) {
              console.warn('Could not load review summary for vendor', v.id, e);
              return Object.assign({}, v, {
                reviewsSummary: { review_count: 0, avg_rating: 0 },
              });
            }
          })
        );
      } catch (err) {
        console.warn('Failed to attach review summaries', err);
        vendorsWithSummaries = vendors;
      }
    }

    // partners & testimonials — use models if available and safe
    let partners = [];
    let testimonials = [];
    try {
      if (partnerModel && typeof partnerModel.getApproved === 'function') {
        partners = await partnerModel.getApproved(12);
      }
    } catch (e) {
      console.warn('Failed to load partners:', e);
      partners = [];
    }
    try {
      if (
        testimonialModel &&
        typeof testimonialModel.getApproved === 'function'
      ) {
        testimonials = await testimonialModel.getApproved(12);
        // attach avatar for each testimonial (falls back to photo_url inside avatarFor)
        if (Array.isArray(testimonials) && testimonials.length) {
          testimonials = testimonials.map((t) =>
            Object.assign({}, t, { avatar: avatarUtil.avatarFor(t, 128) })
          );
        }
      }
    } catch (e) {
      console.warn('Failed to load testimonials:', e);
      testimonials = [];
    }

    const filters = { q: q || '', state: state || '', lga: lga || '' };

    res.render('index', {
      vendors: vendorsWithSummaries,
      partners,
      testimonials,
      stats: res.locals.stats || {},
      filters,
      title: 'Discover local food vendors',
      currentUser: res.locals.currentUser || null,
    });
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

    // load menu items or reviews if you have those models (safe guards)
    let menuItems = [];
    let reviews = [];
    try {
      if (models.menu && typeof models.menu.getByVendorId === 'function') {
        menuItems = await models.menu.getByVendorId(id);
      }
    } catch (e) {
      console.warn('Could not load menu for vendor', id, e);
    }
    try {
      if (models.review && typeof models.review.findByVendorId === 'function') {
        reviews = await models.review.findByVendorId(id);
      }
    } catch (e) {
      console.warn('Could not load reviews for vendor', id, e);
    }

    res.render('vendor/detail', {
      vendor,
      menuItems,
      reviews,
      currentUser: res.locals.currentUser || null,
    });
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

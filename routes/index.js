// routes/index.js
const express = require('express');
const router = express.Router();

const models = require('../models');
const vendorModel = models.vendor;
const reviewModel = models.review || require('../models/reviewModel'); // guard if exported differently
const partnerModel = models.partner || require('../models/partnerModel');
const testimonialModel = models.testimonial || require('../models/testimonialModel');

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
    if (vendors && vendors.length && reviewModel && typeof reviewModel.getRatingSummaryForVendor === 'function') {
      try {
        vendorsWithSummaries = await Promise.all(
          vendors.map(async (v) => {
            try {
              const sum = await reviewModel.getRatingSummaryForVendor(v.id);
              return Object.assign({}, v, { reviewsSummary: sum || { review_count: 0, avg_rating: 0 } });
            } catch (e) {
              console.warn('Could not load review summary for vendor', v.id, e);
              return Object.assign({}, v, { reviewsSummary: { review_count: 0, avg_rating: 0 } });
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
      if (testimonialModel && typeof testimonialModel.getApproved === 'function') {
        testimonials = await testimonialModel.getApproved(12);
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

// Public testimonial submit (any visitor or logged-in client)
router.post('/testimonials', async (req, res) => {
  try {
    const name = (req.body.name && String(req.body.name).trim()) || (req.user && (req.user.name || req.user.full_name)) || 'Anonymous';
    const city = req.body.city && String(req.body.city).trim() || null;
    const quote = req.body.quote && String(req.body.quote).trim();
    const photo_url = req.body.photo_url && String(req.body.photo_url).trim() || null;

    if (!quote || quote.length < 8) {
      if (req.flash) req.flash('error', 'Testimonial must be at least 8 characters long');
      return res.redirect(req.get('Referer') || '/');
    }

    // create testimonial; default approved = false (admin to approve)
    // Use create helper (returns entire row) OR createTestimonial (returns id)
    if (testimonialModel && typeof testimonialModel.create === 'function') {
      await testimonialModel.create({ name, photo_url, city, quote, approved: false });
    } else if (testimonialModel && typeof testimonialModel.createTestimonial === 'function') {
      await testimonialModel.createTestimonial({ name, photo_url, city, quote });
    } else {
      console.warn('No testimonialModel available');
      if (req.flash) req.flash('error', 'Service unavailable');
      return res.redirect(req.get('Referer') || '/');
    }

    if (req.flash) req.flash('success', 'Thanks — your testimonial was submitted and will appear after review');
    return res.redirect(req.get('Referer') || '/');
  } catch (err) {
    console.error('Error submitting testimonial', err);
    if (req.flash) req.flash('error', 'Could not submit testimonial');
    return res.redirect(req.get('Referer') || '/');
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

    res.render('vendor/detail', { vendor, menuItems, reviews, currentUser: res.locals.currentUser || null });
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

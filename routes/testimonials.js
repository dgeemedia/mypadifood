// routes/testimonials.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const auth = require('../middleware/auth'); // expects requireClient
const testimonialModel = require('../models/testimonialModel');
const { pool } = require('../database/database');

// upload directory (ensure exists)
const uploadDir = path.join(__dirname, '../public/uploads/testimonials');
try {
  fs.mkdirSync(uploadDir, { recursive: true });
} catch (e) {
  console.warn('Could not create testimonials upload dir', e);
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) =>
      cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, '-')}`),
  }),
  fileFilter: (req, file, cb) => {
    if (/^image\/(png|jpe?g|webp|svg)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Invalid image type'), false);
  },
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
});

// helper to set flash or session fallback
function pushMessage(req, type, message) {
  if (typeof req.flash === 'function') {
    req.flash(type, message);
  } else if (req.session) {
    // emulate one-shot flash keys used by your middleware (success/error)
    if (type === 'success') req.session.success = message;
    else if (type === 'error') req.session.error = message;
  }
}

// POST /testimonials - submit testimonial (clients only)
router.post('/', auth.requireClient, upload.single('photo'), async (req, res) => {
  try {
    const user = req.user || (req.session && req.session.user) || {};
    const name = (req.body.name && String(req.body.name).trim()) || (user && (user.name || user.email)) || 'Anonymous';
    const city = (req.body.city && String(req.body.city).trim()) || null;

    const rawQuote = req.body.quote ? String(req.body.quote) : '';
    const quoteTrim = rawQuote.trim();
    const charCount = Array.from(quoteTrim).length; // counts code points (emoji-safe)
    const consentGiven = !!req.body.consent; // checkbox

    // Server-side validations
    if (!quoteTrim || charCount < 8) {
      pushMessage(req, 'error', 'Please provide a testimonial (at least 8 characters).');
      return res.redirect(req.get('Referrer') || '/client/dashboard');
    }

    if (!consentGiven) {
      pushMessage(req, 'error', 'Please confirm you consent to publish this testimonial when approved.');
      return res.redirect(req.get('Referrer') || '/client/dashboard');
    }

    const photo_url = req.file ? `/uploads/testimonials/${req.file.filename}` : null;

    // Persist (use model.create if available)
    if (testimonialModel && typeof testimonialModel.create === 'function') {
      await testimonialModel.create({
        name,
        photo_url,
        city,
        quote: quoteTrim,
        consent: true,
        approved: false
      });
    } else {
      // fallback raw SQL (ensure pool is available)
      await pool.query(
        'INSERT INTO testimonials (name, photo_url, city, quote, consent, approved, created_at) VALUES ($1,$2,$3,$4,$5,$6,NOW())',
        [name, photo_url, city, quoteTrim, true, false]
      );
    }

    pushMessage(req, 'success', 'Thank you! Your testimonial will be reviewed before publishing.');
    return res.redirect('/client/dashboard');
  } catch (e) {
    console.error('submit testimonial error', e);
    pushMessage(req, 'error', 'Could not submit testimonial');
    return res.redirect(req.get('Referrer') || '/client/dashboard');
  }
});

// Optional page to show a standalone submit page (if you prefer)
router.get('/submit', auth.requireClient, (req, res) => {
  res.render('testimonials/submit', { currentUser: req.user || req.session.user || null });
});

module.exports = router;

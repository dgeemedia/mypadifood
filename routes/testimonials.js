// routes/testimonials.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const auth = require('../middleware/auth'); // expects requireClient or similar
const { pool } = require('../database/database');

const uploadDir = path.join(__dirname, '../public/uploads/testimonials');
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
  limits: { fileSize: 2 * 1024 * 1024 },
});

// POST /testimonials - submit testimonial (clients only)
router.post('/', auth.requireClient, upload.single('photo'), async (req, res) => {
  try {
    const user = req.user || (req.session && req.session.user);
    const name = (req.body.name && String(req.body.name).trim()) || (user && (user.name || user.email)) || 'Anonymous';
    const city = (req.body.city && String(req.body.city).trim()) || null;
    const quote = (req.body.quote && String(req.body.quote).trim()) || null;

    if (!quote) {
      req.flash('error', 'Please provide your testimonial');
      return res.redirect(req.get('Referrer') || '/');
    }

    const photo_url = req.file ? `/uploads/testimonials/${req.file.filename}` : null;

    await pool.query('INSERT INTO testimonials (name, photo_url, city, quote, approved, created_at) VALUES ($1,$2,$3,$4,false,NOW())', [name, photo_url, city, quote]);

    req.flash('success', 'Thank you! Your testimonial will be reviewed before publishing.');
    res.redirect(req.get('Referrer') || '/');
  } catch (e) {
    console.error('submit testimonial error', e);
    req.flash('error', 'Could not submit testimonial');
    res.redirect(req.get('Referrer') || '/');
  }
});

// Optional: expose a small page to show the form if you don't use the partial
router.get('/submit', auth.requireClient, (req, res) => {
  res.render('testimonials/submit'); // optional view if you create it
});

module.exports = router;

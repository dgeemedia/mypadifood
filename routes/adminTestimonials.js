// routes/adminTestimonials.js
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { pool } = require('../database/database');

// list pending testimonials
router.get('/', auth.requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT id, name, photo_url, city, quote, created_at FROM testimonials WHERE approved = false ORDER BY created_at ASC");
    res.render('admin/testimonials-pending', { testimonials: rows });
  } catch (e) {
    console.error('admin testimonials list error', e);
    req.flash('error', 'Could not load testimonials');
    res.redirect('/admin/dashboard');
  }
});

// approve
router.post('/:id/approve', auth.requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    await pool.query('UPDATE testimonials SET approved = true WHERE id = $1', [id]);
    req.flash('success', 'Testimonial approved');
    res.redirect('/admin/testimonials');
  } catch (e) {
    console.error('approve testimonial error', e);
    req.flash('error', 'Could not approve testimonial');
    res.redirect('/admin/testimonials');
  }
});

// reject (delete)
router.post('/:id/reject', auth.requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    await pool.query('DELETE FROM testimonials WHERE id = $1', [id]);
    req.flash('success', 'Testimonial rejected and removed');
    res.redirect('/admin/testimonials');
  } catch (e) {
    console.error('reject testimonial error', e);
    req.flash('error', 'Could not reject testimonial');
    res.redirect('/admin/testimonials');
  }
});

module.exports = router;

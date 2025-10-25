// routes/adminTestimonials.js
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const adminTestimonialsController = require('../controllers/adminTestimonialsController');

router.get('/', auth.requireAdmin, adminTestimonialsController.listPending);
router.post('/:id/approve', auth.requireAdmin, adminTestimonialsController.approve);
router.post('/:id/reject', auth.requireAdmin, adminTestimonialsController.reject);

module.exports = router;

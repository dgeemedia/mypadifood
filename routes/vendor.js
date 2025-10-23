// routes/vendor.js
const express = require('express');
const router = express.Router();

const vendorController = require('../controllers/vendorController');
const vendorValidation = require('../utils/vendor-validation');

// Vendor registration
router.get('/register', vendorController.showRegisterForm);
router.post(
  '/register',
  vendorValidation.registrationRules(),
  vendorValidation.checkRegData,
  vendorController.register
);

// Protected thanks page (one-time session token)
router.get('/thanks', vendorController.thanksPage);

// Public vendor detail page (shows vendor + nested reviews)
router.get('/:id', vendorController.show);

module.exports = router;

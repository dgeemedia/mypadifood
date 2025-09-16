// routes/vendor.js
const express = require('express');
const router = express.Router();

const vendorController = require('../controllers/vendorController');

// Vendor registration (no login for vendors in this simple flow)
router.get('/register', vendorController.showRegisterForm);
router.post('/register', vendorController.register);

module.exports = router;

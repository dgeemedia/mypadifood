// routes/vendor.js - vendor registration flow (vendors don't log in here)
const express = require('express');
const router = express.Router();
const vendorController = require('../controllers/vendorController');

// show vendor registration form
router.get('/register', vendorController.showRegisterForm);

// submit vendor registration
router.post('/register', vendorController.register);

module.exports = router;

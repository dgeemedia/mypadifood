// routes/client.js
const express = require('express');
const router = express.Router();

const clientController = require('../controllers/clientController');
const auth = require('../middleware/auth');

// Registration & verification
router.get('/register', clientController.showRegister);
router.post('/register', clientController.register);
router.get('/verify', clientController.verifyEmail);

// Show resend verification form
router.get('/resend-verification', clientController.showResendForm);
router.post('/resend-verification', clientController.resendVerification);

// Login/logout
router.get('/login', clientController.showLogin);
router.post('/login', clientController.login);
router.get('/logout', clientController.logout);

// Dashboard & booking (protected)
router.get('/dashboard', auth.requireClient, clientController.dashboard);
router.post('/book', auth.requireClient, clientController.bookVendor);

module.exports = router;

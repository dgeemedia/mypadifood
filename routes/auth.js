// routes/auth.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const clientController = require('../controllers/clientController'); // <-- add this

router.get('/login', authController.showLogin);
router.post('/login', authController.login);

// forgot/reset endpoints at root
router.get('/forgot-password', clientController.showForgotForm);
router.post('/forgot-password', clientController.postForgot);

router.get('/reset-password', clientController.showResetForm); // ?token=...
router.post('/reset-password', clientController.postReset);

// signup choice page
router.get('/signup-choice', authController.showSignupChoice);
router.get('/signup', authController.showSignupChoice);

// logout
router.post('/logout', authController.logout);
router.get('/logout', authController.logout);

module.exports = router;

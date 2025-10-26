// routes/auth.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

router.get('/login', authController.showLogin);
router.post('/login', authController.login);

// signup choice page
router.get('/signup-choice', authController.showSignupChoice);
router.get('/signup', authController.showSignupChoice);

// Add both POST and GET for /logout (POST recommended)
router.post('/logout', authController.logout);
router.get('/logout', authController.logout);

module.exports = router;

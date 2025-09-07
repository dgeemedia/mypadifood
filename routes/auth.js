const express = require('express');
const router = express.Router();
const auth = require('../controllers/authController');

router.get('/signup', auth.showSignup);
router.post('/signup', auth.signup);
router.get('/login', auth.showLogin);
router.post('/login', auth.login);
router.get('/logout', auth.logout);

module.exports = router;

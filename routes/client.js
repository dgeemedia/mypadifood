// routes/client.js - client registration, login, dashboard, book vendor
const express = require('express');
const router = express.Router();
const clientController = require('../controllers/clientController');
const authMiddleware = require('../middleware/auth');

router.get('/register', clientController.showRegister);
router.post('/register', clientController.register);
router.get('/verify', clientController.verifyEmail);
router.get('/login', clientController.showLogin);
router.post('/login', clientController.login);
router.get('/logout', clientController.logout);

router.get('/dashboard', authMiddleware.requireClient, clientController.dashboard);
router.post('/book', authMiddleware.requireClient, clientController.bookVendor);

module.exports = router;
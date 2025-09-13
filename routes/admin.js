// routes/admin.js
const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const auth = require('../middleware/auth');

router.get('/login', adminController.showLogin);
router.post('/login', adminController.login);
router.get('/logout', adminController.logout);

// create admin form (only accessible to super admins)
router.get('/create', auth.requireAdmin, adminController.showCreateForm);
router.post('/create', auth.requireAdmin, adminController.createAdmin);

router.get('/dashboard', auth.requireAdmin, adminController.dashboard);
router.get('/vendors/pending', auth.requireAdmin, adminController.pendingVendors);
router.post('/vendors/decision', auth.requireAdmin, adminController.vendorDecision);

module.exports = router;

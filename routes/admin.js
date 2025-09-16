// routes/admin.js
const express = require('express');
const router = express.Router();

const adminController = require('../controllers/adminController');
const auth = require('../middleware/auth');

// Public admin auth routes
router.get('/login', adminController.showLogin);
router.post('/login', adminController.login);
router.get('/logout', adminController.logout);

// Protected admin area (uses middleware.requireAdmin / requireSuper)
router.get('/dashboard', auth.requireAdmin, adminController.dashboard);
router.get('/vendors/pending', auth.requireAdmin, adminController.pendingVendors);
router.post('/vendors/decision', auth.requireAdmin, adminController.vendorDecision);

// Admin creation (form + handler). Route-level middleware will restrict access.
router.get('/create', auth.requireAdmin, adminController.showCreateForm);
router.post('/create', auth.requireAdmin, adminController.createAdmin);

module.exports = router;

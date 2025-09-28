// routes/admin.js
const express = require('express');
const router = express.Router();

const adminController = require('../controllers/adminController');
const auth = require('../middleware/auth');

// Public admin auth routes
router.get('/login', adminController.showLogin);
router.post('/login', adminController.login);
router.get('/logout', adminController.logout);

// Public password reset routes
router.get('/forgot', adminController.showForgot);
router.post('/forgot', adminController.forgot);
router.get('/reset', adminController.showReset);    // e.g. /admin/reset?token=...
router.post('/reset', adminController.reset);

// Protected admin area (uses middleware.requireAdmin / requireSuper)
router.get('/dashboard', auth.requireAdmin, adminController.dashboard);
router.get(
  '/vendors/pending',
  auth.requireAdmin,
  adminController.pendingVendors
);
router.post(
  '/vendors/decision',
  auth.requireAdmin,
  adminController.vendorDecision
);

// Admin creation (form + handler). Route-level middleware will restrict access.
router.get('/create', auth.requireAdmin, adminController.showCreateForm);
router.post('/create', auth.requireAdmin, adminController.createAdmin);

router.post('/notifications/:id/read', auth.requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    await require('../models').notification.markNotificationRead(id);
    res.json({ ok: true });
  } catch (e) {
    console.error('mark notif read error', e);
    res.status(500).json({ ok: false });
  }
});

module.exports = router;

// routes/admin.js
const express = require('express');
const router = express.Router();

const adminController = require('../controllers/adminController');
const auth = require('../middleware/auth');
const authController = require('../controllers/authController');

// Add testimonials controller require
const adminTestimonialsController = require('../controllers/adminTestimonialsController');

// Public admin auth routes
router.get('/login', adminController.showLogin);
router.post('/login', authController.login);
router.get('/logout', (req, res) => {
  return res.redirect('/logout');
});

// Public password reset routes
router.get('/forgot', adminController.showForgot);
router.post('/forgot', adminController.forgot);
router.get('/reset', adminController.showReset); // e.g. /admin/reset?token=...
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

// pending riders + decision
router.get('/riders/pending', auth.requireAdmin, adminController.pendingRiders);
router.post(
  '/riders/decision',
  auth.requireAdmin,
  adminController.riderDecision
);

// resources listing + JSON data + CSV export
router.get('/resources', auth.requireAdmin, adminController.resourcesPage);
router.get('/resources/data', auth.requireAdmin, adminController.resourcesData);
router.get(
  '/resources/export',
  auth.requireAdmin,
  adminController.resourcesExport
);

// Admin creation (form + handler). Route-level middleware will restrict access.
router.get('/create', auth.requireAdmin, adminController.showCreateForm);
router.post('/create', auth.requireAdmin, adminController.createAdmin);

// Notifications mark-read (AJAX)
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

/* ---------------------------
   WEEKLY PLANS (admin)
   keep these here at /admin/food-orders...
*/
router.get(
  '/food-orders',
  auth.requireAdmin,
  adminController.pendingWeeklyPlans
);
router.get(
  '/food-orders/:planId',
  auth.requireAdmin,
  adminController.viewWeeklyPlan
);
router.post(
  '/food-orders/:planId/accept',
  auth.requireAdmin,
  adminController.acceptWeeklyPlan
);
router.post(
  '/food-orders/:planId/complete',
  auth.requireAdmin,
  adminController.completeWeeklyPlan
);

// withdrawls
router.get('/withdrawals', adminController.listPendingWithdrawals);
router.post('/withdrawals/:id/approve', adminController.approveWithdrawal);
router.post('/withdrawals/:id/decline', adminController.declineWithdrawal);

// Admin can reply to a review
router.post('/reviews/:id/reply', auth.requireAdmin, (req, res) =>
  require('../controllers/reviewController').postReplyByAdmin(req, res)
);

/* ---------------------------
   NEW: Testimonials management
*/
router.get(
  '/testimonials/pending',
  auth.requireAdmin,
  adminTestimonialsController.listPending
);
router.post(
  '/testimonials/:id/approve',
  auth.requireAdmin,
  adminTestimonialsController.approve
);
router.post(
  '/testimonials/:id/reject',
  auth.requireAdmin,
  adminTestimonialsController.reject
);

module.exports = router;

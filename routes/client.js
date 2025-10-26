// routes/client.js
const express = require('express');
const router = express.Router();

const clientController = require('../controllers/clientController');
const clientValidation = require('../utils/client-validation');
const auth = require('../middleware/auth');
const authController = require('../controllers/authController');

// Registration & verification
router.get('/register', clientController.showRegister);

// Apply validation middleware before the controller handler for POST /register
router.post(
  '/register',
  clientValidation.registrationRules(),
  clientValidation.checkRegData,
  clientController.register
);

router.get('/verify', clientController.verifyEmail);

// Show resend verification form
router.get('/resend-verification', clientController.showResendForm);
router.post('/resend-verification', clientController.resendVerification);

// Login/logout
router.get('/login', clientController.showLogin);
router.post('/login', authController.login); // <--- use unified login
router.get('/logout', (req, res) => {
  return res.redirect('/logout');
});

router.get('/forgot-password', clientController.showForgotForm);
router.post('/forgot-password', clientController.postForgot);

router.get('/reset-password', clientController.showResetForm); // ?token=...
router.post('/reset-password', clientController.postReset);

// Dashboard & booking (protected)
router.get('/dashboard', auth.requireClient, clientController.dashboard);
router.post('/book', auth.requireClient, clientController.bookVendor);

router.get('/account', auth.requireClient, clientController.showAccountMenu);

// Edit pages (render forms)
router.get(
  '/account/phone',
  auth.requireClient,
  clientController.showPhoneForm
);
router.get(
  '/account/address',
  auth.requireClient,
  clientController.showAddressForm
);
router.get(
  '/account/password',
  auth.requireClient,
  clientController.showPasswordForm
);

// API endpoints (AJAX) - return JSON
router.post('/account/phone', auth.requireClient, clientController.updatePhone);
router.post(
  '/account/address',
  auth.requireClient,
  clientController.updateAddress
);
router.post(
  '/account/password',
  auth.requireClient,
  clientController.updatePassword
);

router.post(
  '/order/:orderId/menu',
  auth.requireClient,
  clientController.postOrderMenu
);

// ===============================
// Weekly plan routes (protected)
// ===============================
router.get(
  '/special-order',
  auth.requireClient,
  clientController.showSpecialOrderForm
);
router.get(
  '/special-order/:id',
  auth.requireClient,
  clientController.viewWeeklyPlan
);
router.post(
  '/special-order',
  auth.requireClient,
  clientController.postSpecialOrder
);
router.post(
  '/special-order/:id/update',
  auth.requireClient,
  clientController.updateSpecialOrder
);
router.get(
  '/weekly-plans',
  auth.requireClient,
  clientController.listWeeklyPlans
);
router.get(
  '/weekly-plans/:id',
  auth.requireClient,
  clientController.viewWeeklyPlan
);

// wallet routes section
router.get('/wallet', auth.requireClient, clientController.showWallet);
router.post(
  '/wallet/fund',
  auth.requireClient,
  clientController.postFundWallet
);

// new: client withdrawal request (uses controller)
router.post(
  '/withdrawals/request',
  auth.requireClient,
  clientController.postWithdrawalRequest
);

// optional: compatibility previous route (you had /wallet/withdraw)
router.post(
  '/wallet/withdraw',
  auth.requireClient,
  clientController.postWithdrawalRequest
);

router.post(
  '/wallet/withdraw',
  auth.requireClient,
  clientController.postWithdrawalRequest
);
router.get(
  '/wallet/withdrawals',
  auth.requireClient,
  clientController.listMyWithdrawals
);

// Client can post a new review for a vendor
router.post('/vendor/:vendorId/reviews', auth.requireClient, (req, res) =>
  require('../controllers/reviewController').postReview(req, res)
);

// Client can reply to a review
router.post('/reviews/:id/reply', auth.requireClient, (req, res) =>
  require('../controllers/reviewController').postReplyByClient(req, res)
);

module.exports = router;

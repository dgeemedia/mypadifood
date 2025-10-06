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

// Dashboard & booking (protected)
router.get('/dashboard', auth.requireClient, clientController.dashboard);
router.post('/book', auth.requireClient, clientController.bookVendor);

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

module.exports = router;

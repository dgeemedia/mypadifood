// routes/payments.js
const express = require('express');
const router = express.Router();
const paymentsController = require('../controllers/paymentsController');

// Redirect/callback endpoints
router.get('/paystack/verify', paymentsController.paystackRedirectHandler);
router.get(
  '/flutterwave/callback',
  paymentsController.flutterwaveCallbackHandler
);

// Webhooks (POST)
router.post('/webhook/paystack', paymentsController.paystackWebhookHandler);
router.post(
  '/webhook/flutterwave',
  paymentsController.flutterwaveWebhookHandler
);

module.exports = router;

// routes/payments.js
const express = require('express');
const router = express.Router();

const payments = require('../utils/payments');
const models = require('../models');
const orderModel = models.order;

// Paystack verification endpoint — Paystack will redirect here with ?reference=...
router.get('/paystack/verify', async (req, res) => {
  const { reference } = req.query;
  if (!reference) {
    req.session && (req.session.error = 'Missing reference from Paystack.');
    return res.redirect('/client/dashboard');
  }

  try {
    const result = await payments.verifyPaystack(reference);
    if (result && result.success) {
      // Try to obtain orderId from metadata (Paystack returns it under result.data.metadata.orderId)
      const orderId = (result.data && result.data.metadata && result.data.metadata.orderId) || null;

      if (orderId) {
        await orderModel.markPaid(orderId, 'paystack', reference);
        req.session && (req.session.success = 'Payment successful. Thank you!');
        return res.redirect('/client/dashboard');
      } else {
        // No order mapping — fallback: try to find order by stored payment_reference
        // or just show success to user
        req.session && (req.session.success = 'Payment successful (no matching order found).');
        return res.redirect('/client/dashboard');
      }
    } else {
      req.session && (req.session.error = 'Payment not successful. Please contact support.');
      return res.redirect('/client/dashboard');
    }
  } catch (err) {
    console.error('Paystack verify error:', err && err.message ? err.message : err);
    req.session && (req.session.error = 'Verification failed for Paystack payment.');
    return res.redirect('/client/dashboard');
  }
});

// Flutterwave callback — redirect returns query params: status, tx_ref, transaction_id (depending)
router.get('/flutterwave/callback', async (req, res) => {
  // Flutterwave sends query params on redirect; transaction_id is often present as transaction_id
  const { status, tx_ref, transaction_id } = req.query;

  if (!tx_ref && !transaction_id) {
    req.session && (req.session.error = 'Missing transaction information from Flutterwave.');
    return res.redirect('/client/dashboard');
  }

  try {
    // prefer to verify by transaction_id if available
    const toVerifyId = transaction_id || null;
    let verification = null;

    if (toVerifyId) {
      verification = await payments.verifyFlutterwave(toVerifyId);
    } else {
      // Some implementations require a lookup by tx_ref; here we attempt to find the order by tx_ref stored earlier
      // (If you stored tx_ref in payment_reference, you can lookup order by payment_reference)
      // fallback: mark success if status param indicates success
      verification = { success: (status === 'successful' || status === 'successful'), data: { tx_ref } };
    }

    if (verification && verification.success) {
      // If Flutterwave included meta.orderId or tx_ref maps to orderId, use it
      const metaOrderId = verification.data && verification.data.meta && verification.data.meta.orderId;
      const orderId = metaOrderId || verification.data && verification.data.tx_ref || null;

      // If tx_ref stored in orders.payment_reference on init, we can find by that:
      let finalOrderId = null;
      if (metaOrderId) finalOrderId = metaOrderId;
      else if (verification.data && verification.data.tx_ref) {
        // attempt to find order by payment_reference = tx_ref
        const { rows } = await require('../database/database').pool.query('SELECT id FROM orders WHERE payment_reference = $1 LIMIT 1', [verification.data.tx_ref]);
        if (rows && rows[0] && rows[0].id) finalOrderId = rows[0].id;
      }

      if (finalOrderId) {
        await orderModel.markPaid(finalOrderId, 'flutterwave', verification.data.id || verification.data.tx_ref || null);
        req.session && (req.session.success = 'Payment successful. Thank you!');
        return res.redirect('/client/dashboard');
      } else {
        req.session && (req.session.success = 'Payment successful (no matching order found).');
        return res.redirect('/client/dashboard');
      }
    } else {
      req.session && (req.session.error = 'Flutterwave payment not successful or could not be verified.');
      return res.redirect('/client/dashboard');
    }
  } catch (err) {
    console.error('Flutterwave verify error:', err && err.message ? err.message : err);
    req.session && (req.session.error = 'Verification failed for Flutterwave payment.');
    return res.redirect('/client/dashboard');
  }
});

module.exports = router;

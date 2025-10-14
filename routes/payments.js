// routes/payments.js
const express = require('express');
const router = express.Router();

const paymentsUtil = require('../utils/payments');
const models = require('../models');
const orderModel = models.order;
const paymentModel = models.payment; // ensure you've added to models/index.js
const walletModel = models.wallet; // new: wallet model

// ---------- Paystack verification redirect (GET) ----------
router.get('/paystack/verify', async (req, res) => {
  const { reference } = req.query;
  if (!reference) {
    req.session && (req.session.error = 'Missing reference from Paystack.');
    return res.redirect('/client/dashboard');
  }

  try {
    // server-to-server verify using Paystack API helper (existing)
    const result = await paymentsUtil.verifyPaystack(reference);

    // persist raw verification response for audit
    await paymentModel.createPayment({
      orderId:
        result.data && result.data.metadata && result.data.metadata.orderId
          ? result.data.metadata.orderId
          : null,
      provider: 'paystack',
      event: 'verification',
      providerReference: reference,
      amount:
        result.data && result.data.amount
          ? Number(result.data.amount) / 100
          : null, // convert kobo to NGN
      currency: result.data && result.data.currency,
      status: result.data && result.data.status,
      raw: result,
    });

    // --- wallet top-up handling (Paystack) ---
    // metadata format expected: { wallet_topup: true, clientId: "<uuid>" }
    const metadata = (result.data && result.data.metadata) || {};
    const amountNGN =
      result.data && result.data.amount
        ? Number(result.data.amount) / 100
        : null;

    if (metadata && metadata.wallet_topup && metadata.clientId && amountNGN) {
      try {
        // idempotently credit wallet using provider+reference
        await walletModel.creditFromProvider(metadata.clientId, amountNGN, {
          provider: 'paystack',
          providerReference: reference,
          orderId: null,
          note: 'wallet top-up via paystack',
          raw: result,
        });

        // record a wallet_topup event for audit/separation of concerns
        await paymentModel.createPayment({
          orderId: null,
          provider: 'paystack',
          event: 'wallet_topup',
          providerReference: reference,
          amount: amountNGN,
          currency: result.data && result.data.currency,
          status: result.data && result.data.status,
          raw: result,
        });

        req.session && (req.session.success = 'Wallet funded successfully.');
        return res.redirect('/client/dashboard#section-wallet');
      } catch (e) {
        console.error('Error crediting wallet (paystack verify):', e);
        // fall through to regular order flow - but we surface a helpful message
        req.session &&
          (req.session.error =
            'Payment verified but could not credit wallet. Contact support.');
        return res.redirect('/client/dashboard');
      }
    }

    // existing order flow (unchanged)
    if (result && result.success) {
      const orderId =
        result.data && result.data.metadata && result.data.metadata.orderId;
      if (orderId) {
        await orderModel.markPaid(orderId, 'paystack', reference);
        req.session && (req.session.success = 'Payment successful. Thank you!');
        return res.redirect('/client/dashboard');
      } else {
        // try to find order by stored payment_reference
        // (this block left intentionally minimal)
        req.session &&
          (req.session.success =
            'Payment successful (no matching order found).');
        return res.redirect('/client/dashboard');
      }
    } else {
      req.session &&
        (req.session.error = 'Payment not successful. Please contact support.');
      return res.redirect('/client/dashboard');
    }
  } catch (err) {
    console.error('Paystack verify error:', err);
    req.session &&
      (req.session.error = 'Verification failed for Paystack payment.');
    return res.redirect('/client/dashboard');
  }
});

// ---------- Flutterwave redirect/callback (GET) ----------
router.get('/flutterwave/callback', async (req, res) => {
  const { status, tx_ref, transaction_id } = req.query;

  try {
    let verification = null;
    if (transaction_id) {
      verification = await paymentsUtil.verifyFlutterwave(transaction_id);
    } else {
      verification = {
        success: status === 'successful' || status === 'success',
        data: { tx_ref, status },
      };
    }

    // persist verification for audit
    await paymentModel.createPayment({
      orderId:
        verification.data &&
        verification.data.meta &&
        verification.data.meta.orderId
          ? verification.data.meta.orderId
          : null,
      provider: 'flutterwave',
      event: 'verification',
      providerReference:
        verification.data && (verification.data.id || verification.data.tx_ref)
          ? verification.data.id || verification.data.tx_ref
          : tx_ref,
      amount:
        verification.data && verification.data.amount
          ? Number(verification.data.amount)
          : null,
      currency:
        verification.data && verification.data.currency
          ? verification.data.currency
          : null,
      status:
        verification.data && verification.data.status
          ? verification.data.status
          : null,
      raw: verification,
    });

    // --- wallet top-up handling (Flutterwave) ---
    // Flutterwave may include meta: { wallet_topup: true, clientId: "<uuid>" }
    const meta = (verification.data && verification.data.meta) || {};
    const fwAmount =
      verification.data && verification.data.amount
        ? Number(verification.data.amount)
        : null;
    const fwRef =
      verification.data && (verification.data.id || verification.data.tx_ref)
        ? verification.data.id || verification.data.tx_ref
        : tx_ref;

    if (
      verification &&
      verification.success &&
      meta.wallet_topup &&
      meta.clientId &&
      fwAmount
    ) {
      try {
        await walletModel.creditFromProvider(meta.clientId, fwAmount, {
          provider: 'flutterwave',
          providerReference: fwRef,
          orderId: null,
          note: 'wallet top-up via flutterwave',
          raw: verification,
        });

        await paymentModel.createPayment({
          orderId: null,
          provider: 'flutterwave',
          event: 'wallet_topup',
          providerReference: fwRef,
          amount: fwAmount,
          currency: verification.data && verification.data.currency,
          status: verification.data && verification.data.status,
          raw: verification,
        });

        req.session && (req.session.success = 'Wallet funded successfully.');
        return res.redirect('/client/dashboard#section-wallet');
      } catch (e) {
        console.error('Error crediting wallet (flutterwave verify):', e);
        req.session &&
          (req.session.error =
            'Payment verified but could not credit wallet. Contact support.');
        return res.redirect('/client/dashboard');
      }
    }

    // existing order flow
    if (verification && verification.success) {
      const metaOrderId =
        verification.data &&
        verification.data.meta &&
        verification.data.meta.orderId;
      let finalOrderId = metaOrderId || null;

      if (!finalOrderId && verification.data && verification.data.tx_ref) {
        // attempt to find order by payment_reference field
        const { rows } = await require('../database/database').pool.query(
          'SELECT id FROM orders WHERE payment_reference = $1 LIMIT 1',
          [verification.data.tx_ref]
        );
        if (rows && rows[0] && rows[0].id) finalOrderId = rows[0].id;
      }

      if (finalOrderId) {
        await orderModel.markPaid(
          finalOrderId,
          'flutterwave',
          verification.data &&
            (verification.data.id || verification.data.tx_ref)
            ? verification.data.id || verification.data.tx_ref
            : tx_ref
        );
        req.session && (req.session.success = 'Payment successful. Thank you!');
        return res.redirect('/client/dashboard');
      } else {
        req.session &&
          (req.session.success =
            'Payment successful (no matching order found).');
        return res.redirect('/client/dashboard');
      }
    } else {
      req.session &&
        (req.session.error =
          'Flutterwave payment not successful or could not be verified.');
      return res.redirect('/client/dashboard');
    }
  } catch (err) {
    console.error('Flutterwave verify error:', err);
    req.session &&
      (req.session.error = 'Verification failed for Flutterwave payment.');
    return res.redirect('/client/dashboard');
  }
});

// ---------- Paystack webhook (POST) ----------
router.post('/webhook/paystack', async (req, res) => {
  try {
    // verify signature
    const ok = paymentsUtil.verifyPaystackWebhook(req);
    if (!ok) {
      console.warn('Paystack webhook signature mismatch');
      return res.status(400).send('invalid signature');
    }

    const payload = req.body; // parsed JSON
    const data = payload && payload.data ? payload.data : payload;
    const event = payload.event || null;
    const reference =
      data && data.reference
        ? data.reference
        : data && data.id
          ? data.id
          : null;
    const orderId =
      data && data.metadata && data.metadata.orderId
        ? data.metadata.orderId
        : null;
    const amount = data && data.amount ? Number(data.amount) / 100 : null;
    const currency = data && data.currency ? data.currency : null;
    const status = data && data.status ? data.status : null;

    // persist raw payload
    await paymentModel.createPayment({
      orderId,
      provider: 'paystack',
      event,
      providerReference: reference,
      amount,
      currency,
      status,
      raw: payload,
    });

    // --- wallet top-up handling (Paystack webhook) ---
    // metadata expected: data.metadata.wallet_topup and data.metadata.clientId
    const meta = (data && data.metadata) || {};
    if (
      data &&
      (data.status === 'success' ||
        data.status === 'successful' ||
        payload.event === 'charge.success') &&
      meta &&
      meta.wallet_topup &&
      meta.clientId &&
      amount
    ) {
      try {
        // idempotent credit
        await walletModel.creditFromProvider(meta.clientId, amount, {
          provider: 'paystack',
          providerReference: reference,
          orderId: null,
          note: 'wallet top-up via paystack (webhook)',
          raw: payload,
        });

        // record wallet_topup event too (optional duplicate but useful)
        await paymentModel.createPayment({
          orderId: null,
          provider: 'paystack',
          event: 'wallet_topup',
          providerReference: reference,
          amount,
          currency,
          status,
          raw: payload,
        });

        // acknowledge
        return res.status(200).send('ok');
      } catch (e) {
        console.error('Error crediting wallet (paystack webhook):', e);
        // still ack so provider doesn't retry excessively; but you may prefer to return 500 if you want retries
        return res.status(200).send('ok');
      }
    }

    // If successful charge, mark order paid (existing behavior)
    if (
      data &&
      (data.status === 'success' ||
        data.status === 'successful' ||
        payload.event === 'charge.success')
    ) {
      if (orderId) {
        await orderModel.markPaid(orderId, 'paystack', reference);
      } else {
        // attempt to find order by payment_reference stored earlier
        const { rows } = await require('../database/database').pool.query(
          'SELECT id FROM orders WHERE payment_reference = $1 LIMIT 1',
          [reference]
        );
        if (rows && rows[0] && rows[0].id) {
          await orderModel.markPaid(rows[0].id, 'paystack', reference);
        }
      }
    }

    // Acknowledge quickly
    return res.status(200).send('ok');
  } catch (err) {
    console.error('Paystack webhook handler error:', err);
    return res.status(500).send('server error');
  }
});

// ---------- Flutterwave webhook (POST) ----------
router.post('/webhook/flutterwave', async (req, res) => {
  try {
    // verify header (verif-hash)
    const ok = paymentsUtil.verifyFlutterwaveWebhook(req);
    if (!ok) {
      console.warn('Flutterwave webhook signature mismatch');
      return res.status(400).send('invalid signature');
    }

    const payload = req.body; // parsed JSON
    const data = payload && payload.data ? payload.data : payload;
    const event = payload.event || null;
    const tx_ref = data && data.tx_ref ? data.tx_ref : null;
    const transaction_id = data && data.id ? data.id : null;
    const status = data && data.status ? data.status : null;
    const amount = data && data.amount ? Number(data.amount) : null;
    const currency = data && data.currency ? data.currency : null;
    const orderId =
      data && data.meta && data.meta.orderId ? data.meta.orderId : null;

    // persist raw payload
    await paymentModel.createPayment({
      orderId,
      provider: 'flutterwave',
      event,
      providerReference: transaction_id || tx_ref,
      amount,
      currency,
      status,
      raw: payload,
    });

    // --- wallet top-up handling (Flutterwave webhook) ---
    const meta = (data && data.meta) || {};
    const fwRef = transaction_id || tx_ref;
    if (
      (status === 'successful' || status === 'completed') &&
      meta &&
      meta.wallet_topup &&
      meta.clientId &&
      amount
    ) {
      try {
        await walletModel.creditFromProvider(meta.clientId, amount, {
          provider: 'flutterwave',
          providerReference: fwRef,
          orderId: null,
          note: 'wallet top-up via flutterwave (webhook)',
          raw: payload,
        });

        await paymentModel.createPayment({
          orderId: null,
          provider: 'flutterwave',
          event: 'wallet_topup',
          providerReference: fwRef,
          amount,
          currency,
          status,
          raw: payload,
        });

        return res.status(200).send('ok');
      } catch (e) {
        console.error('Error crediting wallet (flutterwave webhook):', e);
        return res.status(200).send('ok');
      }
    }

    // If successful, mark order paid
    if (status === 'successful' || status === 'completed') {
      let finalOrderId = orderId || null;
      if (!finalOrderId && tx_ref) {
        const { rows } = await require('../database/database').pool.query(
          'SELECT id FROM orders WHERE payment_reference = $1 LIMIT 1',
          [tx_ref]
        );
        if (rows && rows[0] && rows[0].id) finalOrderId = rows[0].id;
      }
      if (finalOrderId) {
        await orderModel.markPaid(
          finalOrderId,
          'flutterwave',
          transaction_id || tx_ref
        );
      }
    }

    return res.status(200).send('ok');
  } catch (err) {
    console.error('Flutterwave webhook handler error:', err);
    return res.status(500).send('server error');
  }
});

module.exports = router;

// controllers/paymentsController.js
// Handles Paystack & Flutterwave redirect callbacks and webhook events.
//
// Exports:
//  - paystackRedirectHandler(req, res)   // GET /api/payments/paystack/verify
//  - paystackWebhookHandler(req, res)    // POST /api/payments/webhook/paystack
//  - flutterwaveCallbackHandler(req,res) // GET /api/payments/flutterwave/callback
//  - flutterwaveWebhookHandler(req,res)  // POST /api/payments/webhook/flutterwave
//
// Relies on:
//  - ../utils/payments
//  - ../models: payment, wallet, client, order, weeklyPlan (best-effort)
//  - ../database/database for raw fallback queries

const paymentsUtil = require('../utils/payments');
const models = require('../models');
const paymentModel = models.payment;
const walletModel = models.wallet;
const clientModel = models.client;
const orderModel = models.order;
const weeklyPlanModel = models.weeklyPlan;
const db = require('../database/database'); // { pool }

function safeLog(...args) {
  console.log('[paymentsController]', ...args);
}

async function persistPaymentRecord({
  orderId = null,
  provider,
  event = null,
  providerReference = null,
  amount = null,
  currency = null,
  status = null,
  raw = {},
}) {
  try {
    if (!paymentModel || typeof paymentModel.createPayment !== 'function') return null;
    return await paymentModel.createPayment({
      orderId,
      provider,
      event,
      providerReference,
      amount,
      currency,
      status,
      raw,
    });
  } catch (err) {
    console.warn('persistPaymentRecord failed (non-fatal):', err && err.message ? err.message : err);
    return null;
  }
}

/* ---------- Paystack redirect (GET) ----------
   Expected route: GET /api/payments/paystack/verify?reference=...
*/
exports.paystackRedirectHandler = async (req, res) => {
  const { reference } = req.query;
  if (!reference) {
    if (req.session) req.session.error = 'Missing reference from Paystack.';
    return res.redirect('/client/dashboard');
  }

  try {
    const result = await paymentsUtil.verifyPaystack(reference);
    const data = result && result.data ? result.data : null;
    const metadata = (data && data.metadata) || {};
    const amountNGN = data && data.amount ? Number(data.amount) / 100 : null;
    const currency = data && data.currency ? data.currency : null;
    const status = data && data.status ? data.status : null;

    // persist verification audit
    await persistPaymentRecord({
      orderId: metadata.orderId || null,
      provider: 'paystack',
      event: 'verification',
      providerReference: reference,
      amount: amountNGN,
      currency,
      status,
      raw: result,
    });

    // WALLET TOP-UP flow
    if (metadata && metadata.wallet_topup && metadata.clientId && amountNGN) {
      try {
        const client = await clientModel.findById(metadata.clientId);
        if (!client) {
          safeLog('Paystack redirect: client not found', metadata.clientId);
          if (req.session) req.session.error = 'Payment verified but client not found. Contact support.';
          return res.redirect('/client/dashboard');
        }

        // Idempotent: paymentModel / walletModel will prevent double credit
        const existing = paymentModel && (await paymentModel.findByProviderReference('paystack', reference));
        if (existing && existing.event === 'wallet_topup') {
          if (req.session) req.session.success = 'Wallet already credited.';
          return res.redirect('/client/dashboard#section-wallet');
        }

        await walletModel.creditFromProvider(metadata.clientId, amountNGN, {
          provider: 'paystack',
          providerReference: reference,
          orderId: null,
          note: 'wallet top-up via paystack',
          raw: result,
        });

        await persistPaymentRecord({
          orderId: null,
          provider: 'paystack',
          event: 'wallet_topup',
          providerReference: reference,
          amount: amountNGN,
          currency,
          status,
          raw: result,
        });

        if (req.session) req.session.success = 'Wallet funded successfully.';
        return res.redirect('/client/dashboard#section-wallet');
      } catch (err) {
        console.error('Error crediting wallet (paystack redirect):', err);
        if (req.session) req.session.error = 'Payment verified but could not credit wallet. Contact support.';
        return res.redirect('/client/dashboard');
      }
    }

    // ORDER payment flow
    if (result && result.success) {
      const orderId = metadata.orderId || (data && data.metadata && data.metadata.orderId) || null;
      if (orderId) {
        try {
          if (orderModel && typeof orderModel.markPaid === 'function') {
            await orderModel.markPaid(orderId, 'paystack', reference);
          } else if (orderModel && typeof orderModel.updatePaymentStatus === 'function') {
            await orderModel.updatePaymentStatus(orderId, 'paid', { provider: 'paystack', reference });
          }
          if (req.session) req.session.success = 'Payment successful. Thank you!';
          return res.redirect('/client/dashboard#section-orders');
        } catch (err) {
          console.error('Error marking order paid (paystack redirect):', err);
          if (req.session) req.session.error = 'Payment verified but could not mark order paid. Contact support.';
          return res.redirect('/client/dashboard');
        }
      }

      if (req.session) req.session.success = 'Payment successful.';
      return res.redirect('/client/dashboard');
    }

    if (req.session) req.session.error = 'Payment not successful. Please contact support.';
    return res.redirect('/client/dashboard');
  } catch (err) {
    console.error('Paystack verify error (redirect):', err && err.message ? err.message : err);
    if (req.session) req.session.error = 'Verification failed for Paystack payment.';
    return res.redirect('/client/dashboard');
  }
};

/* ---------- Flutterwave redirect/callback (GET) ----------
   Expected route: GET /api/payments/flutterwave/callback?status=...&tx_ref=...&transaction_id=...
*/
exports.flutterwaveCallbackHandler = async (req, res) => {
  try {
    const { status, tx_ref, transaction_id } = req.query;
    let verification = null;

    if (transaction_id) {
      verification = await paymentsUtil.verifyFlutterwave(transaction_id);
    } else {
      verification = {
        success: status === 'successful' || status === 'success',
        data: { tx_ref, status, meta: {} },
        raw: { query: req.query },
      };
    }

    const data = verification && verification.data ? verification.data : {};
    await persistPaymentRecord({
      orderId: (data.meta && data.meta.orderId) || null,
      provider: 'flutterwave',
      event: 'verification',
      providerReference: (data.id || data.tx_ref) || tx_ref,
      amount: data.amount || null,
      currency: data.currency || null,
      status: data.status || null,
      raw: verification,
    });

    // WALLET TOP-UP via meta
    const meta = data.meta || {};
    const fwAmount = data.amount ? Number(data.amount) : null;
    const fwRef = (data.id || data.tx_ref) || tx_ref;

    if (verification && verification.success && meta.wallet_topup && meta.clientId && fwAmount) {
      try {
        const client = await clientModel.findById(meta.clientId);
        if (!client) {
          safeLog('Flutterwave callback: client not found', meta.clientId);
          if (req.session) req.session.error = 'Payment verified but client not found. Contact support.';
          return res.redirect('/client/dashboard');
        }

        const existing = paymentModel && (await paymentModel.findByProviderReference('flutterwave', fwRef));
        if (!existing || existing.event !== 'wallet_topup') {
          await walletModel.creditFromProvider(meta.clientId, fwAmount, {
            provider: 'flutterwave',
            providerReference: fwRef,
            orderId: null,
            note: 'wallet top-up via flutterwave',
            raw: verification,
          });

          await persistPaymentRecord({
            orderId: null,
            provider: 'flutterwave',
            event: 'wallet_topup',
            providerReference: fwRef,
            amount: fwAmount,
            currency: data.currency || null,
            status: data.status || null,
            raw: verification,
          });
        }

        if (req.session) req.session.success = 'Wallet funded successfully.';
        return res.redirect('/client/dashboard#section-wallet');
      } catch (err) {
        console.error('Error crediting wallet (flutterwave callback):', err);
        if (req.session) req.session.error = 'Payment verified but could not credit wallet. Contact support.';
        return res.redirect('/client/dashboard');
      }
    }

    // ORDER flow
    if (verification && verification.success) {
      let finalOrderId = (data.meta && data.meta.orderId) || null;

      if (!finalOrderId && data.tx_ref) {
        try {
          const { rows } = await db.pool.query('SELECT id FROM orders WHERE payment_reference = $1 LIMIT 1', [data.tx_ref]);
          if (rows && rows[0] && rows[0].id) finalOrderId = rows[0].id;
        } catch (e) {
          console.warn('Order lookup failed (flutterwave callback):', e && e.message ? e.message : e);
        }
      }

      if (finalOrderId) {
        try {
          if (orderModel && typeof orderModel.markPaid === 'function') {
            await orderModel.markPaid(finalOrderId, 'flutterwave', data.id || data.tx_ref);
          }
          if (req.session) req.session.success = 'Payment successful. Thank you!';
          return res.redirect('/client/dashboard#section-orders');
        } catch (err) {
          console.error('Error marking order paid (flutterwave):', err);
          if (req.session) req.session.error = 'Payment verified but could not mark order paid. Contact support.';
          return res.redirect('/client/dashboard');
        }
      }

      if (req.session) req.session.success = 'Payment successful.';
      return res.redirect('/client/dashboard');
    }

    if (req.session) req.session.error = 'Flutterwave payment not successful or could not be verified.';
    return res.redirect('/client/dashboard');
  } catch (err) {
    console.error('Flutterwave verify error (redirect):', err && err.message ? err.message : err);
    if (req.session) req.session.error = 'Verification failed for Flutterwave payment.';
    return res.redirect('/client/dashboard');
  }
};

/* ---------- Paystack webhook (POST) ----------
   Expected route: POST /api/payments/webhook/paystack
   NOTE: provider will POST JSON; we use paymentsUtil.verifyPaystackWebhook(req) to validate signature
*/
exports.paystackWebhookHandler = async (req, res) => {
  try {
    const ok = paymentsUtil.verifyPaystackWebhook(req);
    if (!ok) {
      console.warn('Paystack webhook signature mismatch');
      return res.status(400).send('invalid signature');
    }

    const payload = req.body;
    const data = payload && payload.data ? payload.data : payload;
    const event = payload.event || null;
    const reference = data && data.reference ? data.reference : data && data.id ? data.id : null;
    const orderId = data && data.metadata && data.metadata.orderId ? data.metadata.orderId : null;
    const amount = data && data.amount ? Number(data.amount) / 100 : null; // kobo -> NGN
    const currency = data && data.currency ? data.currency : null;
    const status = data && data.status ? data.status : null;

    await persistPaymentRecord({
      orderId,
      provider: 'paystack',
      event,
      providerReference: reference,
      amount,
      currency,
      status,
      raw: payload,
    });

    const meta = (data && data.metadata) || {};
    if (
      data &&
      (data.status === 'success' || data.status === 'successful' || payload.event === 'charge.success') &&
      meta &&
      meta.wallet_topup &&
      meta.clientId &&
      amount
    ) {
      try {
        const existing = paymentModel && (await paymentModel.findByProviderReference('paystack', reference));
        if (!existing || existing.event !== 'wallet_topup') {
          const client = await clientModel.findById(meta.clientId);
          if (!client) {
            console.warn('Paystack webhook: client not found for wallet_topup', meta.clientId);
          } else {
            await walletModel.creditFromProvider(meta.clientId, amount, {
              provider: 'paystack',
              providerReference: reference,
              orderId: null,
              note: 'wallet top-up via paystack (webhook)',
              raw: payload,
            });

            await persistPaymentRecord({
              orderId: null,
              provider: 'paystack',
              event: 'wallet_topup',
              providerReference: reference,
              amount,
              currency,
              status,
              raw: payload,
            });
          }
        }
      } catch (err) {
        console.error('Error crediting wallet (paystack webhook):', err && err.message ? err.message : err);
      }
      // Acknowledge
      return res.status(200).send('ok');
    }

    // Mark order paid when charge succeeded
    if (data && (data.status === 'success' || data.status === 'successful' || payload.event === 'charge.success')) {
      try {
        if (orderId) {
          await orderModel.markPaid(orderId, 'paystack', reference);
        } else {
          const { rows } = await db.pool.query('SELECT id FROM orders WHERE payment_reference = $1 LIMIT 1', [reference]);
          if (rows && rows[0] && rows[0].id) {
            await orderModel.markPaid(rows[0].id, 'paystack', reference);
          }
        }
      } catch (err) {
        console.error('Error marking order paid (paystack webhook):', err && err.message ? err.message : err);
      }
    }

    return res.status(200).send('ok');
  } catch (err) {
    console.error('Paystack webhook handler error:', err && err.message ? err.message : err);
    return res.status(500).send('server error');
  }
};

/* ---------- Flutterwave webhook (POST) ----------
   Expected route: POST /api/payments/webhook/flutterwave
*/
exports.flutterwaveWebhookHandler = async (req, res) => {
  try {
    const ok = paymentsUtil.verifyFlutterwaveWebhook(req);
    if (!ok) {
      console.warn('Flutterwave webhook signature mismatch');
      return res.status(400).send('invalid signature');
    }

    const payload = req.body;
    const data = payload && payload.data ? payload.data : payload;
    const event = payload.event || null;
    const tx_ref = data && data.tx_ref ? data.tx_ref : null;
    const transaction_id = data && data.id ? data.id : null;
    const status = data && data.status ? data.status : null;
    const amount = data && data.amount ? Number(data.amount) : null;
    const currency = data && data.currency ? data.currency : null;
    const orderId = data && data.meta && data.meta.orderId ? data.meta.orderId : null;

    await persistPaymentRecord({
      orderId,
      provider: 'flutterwave',
      event,
      providerReference: transaction_id || tx_ref,
      amount,
      currency,
      status,
      raw: payload,
    });

    const meta = (data && data.meta) || {};
    const fwRef = transaction_id || tx_ref;
    if ((status === 'successful' || status === 'completed') && meta && meta.wallet_topup && meta.clientId && amount) {
      try {
        const existing = paymentModel && (await paymentModel.findByProviderReference('flutterwave', fwRef));
        if (!existing || existing.event !== 'wallet_topup') {
          const client = await clientModel.findById(meta.clientId);
          if (!client) {
            console.warn('Flutterwave webhook: client not found for wallet_topup', meta.clientId);
          } else {
            await walletModel.creditFromProvider(meta.clientId, amount, {
              provider: 'flutterwave',
              providerReference: fwRef,
              orderId: null,
              note: 'wallet top-up via flutterwave (webhook)',
              raw: payload,
            });

            await persistPaymentRecord({
              orderId: null,
              provider: 'flutterwave',
              event: 'wallet_topup',
              providerReference: fwRef,
              amount,
              currency,
              status,
              raw: payload,
            });
          }
        }
      } catch (err) {
        console.error('Error crediting wallet (flutterwave webhook):', err && err.message ? err.message : err);
      }
      return res.status(200).send('ok');
    }

    // Mark order paid when successful
    if (status === 'successful' || status === 'completed') {
      try {
        let finalOrderId = orderId || null;
        if (!finalOrderId && tx_ref) {
          const { rows } = await db.pool.query('SELECT id FROM orders WHERE payment_reference = $1 LIMIT 1', [tx_ref]);
          if (rows && rows[0] && rows[0].id) finalOrderId = rows[0].id;
        }
        if (finalOrderId) {
          await orderModel.markPaid(finalOrderId, 'flutterwave', transaction_id || tx_ref);
        }
      } catch (err) {
        console.error('Error marking order paid (flutterwave webhook):', err && err.message ? err.message : err);
      }
    }

    return res.status(200).send('ok');
  } catch (err) {
    console.error('Flutterwave webhook handler error:', err && err.message ? err.message : err);
    return res.status(500).send('server error');
  }
};

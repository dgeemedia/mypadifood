// controllers/walletController.js
const paymentsUtil = require('../utils/payments');
const models = require('../models'); // adapt to your models/index.js
const walletModel = models.wallet;
const paymentModel = models.payment;
const clientModel = models.client;

const PAYSTACK_PUBLIC_KEY = process.env.PAYSTACK_PUBLIC_KEY || '';
const FLW_PUBLIC_KEY = process.env.FLUTTERWAVE_PUBLIC_KEY || '';

// Small helper to detect an AJAX/fetch request
function wantsJson(req) {
  return req.xhr || (req.headers.accept && req.headers.accept.indexOf('application/json') !== -1);
}

/**
 * POST /client/wallet/init
 * initFund: initialize a provider flow and return JSON with provider data
 */
exports.initFund = async (req, res) => {
  try {
    const clientId = req.session && req.session.user && req.session.user.id;
    if (!clientId) {
      if (wantsJson(req)) return res.status(401).json({ error: 'Not authenticated' });
      req.session && (req.session.error = 'Please log in');
      return res.redirect('/client/login');
    }

    const amount = req.body.amount;
    const provider = (req.body.provider || 'paystack').toLowerCase();

    if (!amount || Number(amount) < 50) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    const client = await clientModel.findById(clientId);
    const metadata = { wallet_topup: true, clientId };

    if (provider === 'paystack') {
      const init = await paymentsUtil.initPaystack(
        { email: client && client.email ? client.email : '', amount, metadata },
        null
      );
      // store init attempt for audit (non-fatal)
      try {
        await paymentModel.createPayment({
          orderId: null,
          provider: 'paystack',
          event: 'init',
          providerReference: init.reference,
          amount: Number(amount),
          currency: 'NGN',
          status: 'pending',
          raw: init.raw || init,
        });
      } catch (e) {
        console.warn('Could not persist paystack init:', e && e.message ? e.message : e);
      }

      return res.json({
        provider: 'paystack',
        authorization_url: init.authorization_url,
        reference: init.reference,
        amountKobo: Math.round(Number(amount) * 100),
        email: client && client.email ? client.email : '',
        paystackPublicKey: PAYSTACK_PUBLIC_KEY,
      });
    }

    if (provider === 'flutterwave') {
      const init = await paymentsUtil.initFlutterwave(
        {
          amount,
          currency: 'NGN',
          customer: {
            email: client && client.email ? client.email : '',
            phonenumber: client && client.phone ? client.phone : '',
            name: client && (client.full_name || client.name) ? (client.full_name || client.name) : '',
          },
        },
        null
      );

      try {
        await paymentModel.createPayment({
          orderId: null,
          provider: 'flutterwave',
          event: 'init',
          providerReference: init.tx_ref,
          amount: Number(amount),
          currency: 'NGN',
          status: 'pending',
          raw: init.raw || init,
        });
      } catch (e) {
        console.warn('Could not persist flutterwave init:', e && e.message ? e.message : e);
      }

      return res.json({
        provider: 'flutterwave',
        payment_link: init.payment_link,
        tx_ref: init.tx_ref,
        amount: String(amount),
        currency: 'NGN',
        publicKey: FLW_PUBLIC_KEY,
      });
    }

    return res.status(400).json({ error: 'Unsupported provider' });
  } catch (err) {
    console.error('initFund error', err && err.stack ? err.stack : err);
    return res.status(500).json({ error: 'Could not initialize payment' });
  }
};

/**
 * POST /client/wallet/verify
 * verifyPayment: verify a provider reference, credit wallet if metadata indicates wallet_topup
 * body: { provider: 'paystack'|'flutterwave', reference: '<ref or transaction id>' }
 */
exports.verifyPayment = async (req, res) => {
  try {
    const { provider, reference } = req.body;
    if (!provider || !reference) return res.status(400).json({ error: 'Missing provider/reference' });

    if (provider === 'paystack') {
      const result = await paymentsUtil.verifyPaystack(reference);
      if (!result || !result.success) {
        return res.status(400).json({ error: 'Verification failed', raw: result && result.raw ? result.raw : result });
      }

      const metadata = (result.data && result.data.metadata) || {};
      const amountNGN = result.data && result.data.amount ? Number(result.data.amount) / 100 : null;

      // wallet topup flow
      if (metadata && metadata.wallet_topup && metadata.clientId && amountNGN) {
        // idempotent credit
        await walletModel.creditFromProvider(metadata.clientId, amountNGN, {
          provider: 'paystack',
          providerReference: reference,
          note: 'wallet top-up via paystack',
          raw: result.raw || result,
        });

        // persist payment audit
        try {
          await paymentModel.createPayment({
            orderId: null,
            provider: 'paystack',
            event: 'wallet_topup',
            providerReference: reference,
            amount: amountNGN,
            currency: result.data && result.data.currency ? result.data.currency : 'NGN',
            status: result.data && result.data.status ? result.data.status : 'success',
            raw: result.raw || result,
          });
        } catch (e) {
          console.warn('Could not persist paystack wallet_topup payment', e && e.message ? e.message : e);
        }

        const updatedBalance = await walletModel.getBalance(metadata.clientId);
        return res.json({ success: true, message: 'Wallet funded', updatedBalance });
      }

      // Non-wallet flow (order etc.) — return verification raw for further server-side handling
      return res.json({ success: true, message: 'Payment verified', raw: result.raw || result });
    }

    if (provider === 'flutterwave') {
      // flutterwave verify may accept transaction id; paymentsUtil.verifyFlutterwave tries that
      const result = await paymentsUtil.verifyFlutterwave(reference);
      if (!result || !result.success) {
        return res.status(400).json({ error: 'Verification failed', raw: result && result.raw ? result.raw : result });
      }

      const meta = (result.data && result.data.meta) || {};
      const fwAmount = result.data && result.data.amount ? Number(result.data.amount) : null;
      const fwRef = result.data && (result.data.id || result.data.tx_ref) ? (result.data.id || result.data.tx_ref) : reference;

      if (meta && meta.wallet_topup && meta.clientId && fwAmount) {
        await walletModel.creditFromProvider(meta.clientId, fwAmount, {
          provider: 'flutterwave',
          providerReference: fwRef,
          note: 'wallet top-up via flutterwave',
          raw: result.raw || result,
        });

        try {
          await paymentModel.createPayment({
            orderId: null,
            provider: 'flutterwave',
            event: 'wallet_topup',
            providerReference: fwRef,
            amount: fwAmount,
            currency: result.data && result.data.currency ? result.data.currency : 'NGN',
            status: result.data && result.data.status ? result.data.status : 'success',
            raw: result.raw || result,
          });
        } catch (e) {
          console.warn('Could not persist flutterwave wallet_topup payment', e && e.message ? e.message : e);
        }

        const updatedBalance = await walletModel.getBalance(meta.clientId);
        return res.json({ success: true, message: 'Wallet funded', updatedBalance });
      }

      return res.json({ success: true, message: 'Payment verified', raw: result.raw || result });
    }

    return res.status(400).json({ error: 'Unknown provider' });
  } catch (err) {
    console.error('verifyPayment error', err && err.stack ? err.stack : err);
    return res.status(500).json({ error: 'Verification failed' });
  }
};

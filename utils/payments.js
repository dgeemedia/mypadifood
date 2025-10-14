// utils/payments.js
// Encapsulate Paystack and Flutterwave init + verify logic and webhook signature verification.

const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

let fetch = global.fetch;
try {
  // node < 18 fallback
  if (!fetch) fetch = require('node-fetch');
} catch (e) {
  // ignore if node-fetch not installed and fetch exists
}

const BASE_URL =
  process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
const PAYSTACK_KEY = process.env.PAYSTACK_SECRET_KEY;
const FLW_KEY = process.env.FLUTTERWAVE_SECRET_KEY;

const PAYSTACK_WEBHOOK_SECRET = process.env.PAYSTACK_WEBHOOK_SECRET || '';
const FLUTTERWAVE_WEBHOOK_SECRET = process.env.FLUTTERWAVE_WEBHOOK_SECRET || '';

if (!PAYSTACK_KEY) {
  console.warn(
    'Warning: PAYSTACK_SECRET_KEY not set — Paystack init/verify will fail until configured.'
  );
}
if (!FLW_KEY) {
  console.warn(
    'Warning: FLUTTERWAVE_SECRET_KEY not set — Flutterwave init/verify will fail until configured.'
  );
}
if (!PAYSTACK_WEBHOOK_SECRET) {
  console.warn(
    'Warning: PAYSTACK_WEBHOOK_SECRET not set — Paystack webhook verification will be disabled.'
  );
}
if (!FLUTTERWAVE_WEBHOOK_SECRET) {
  console.warn(
    'Warning: FLUTTERWAVE_WEBHOOK_SECRET not set — Flutterwave webhook verification will be disabled.'
  );
}

/**
 * Initialize a Paystack transaction.
 * @param {Object} opts { email, amount } amount in NGN (number or string) — will be converted to kobo.
 * @param {string} orderId - optional order id to include in metadata
 * @returns {Promise<{authorization_url, reference, raw}>}
 */
async function initPaystack(
  { email, amount, metadata = {} } = {},
  orderId = null
) {
  if (!PAYSTACK_KEY) throw new Error('Paystack not configured');

  const amountKobo = Math.round(Number(amount) * 100);

  // include metadata and optional orderId
  const body = {
    email,
    amount: amountKobo,
    callback_url: `${BASE_URL}/api/paystack/verify`,
    metadata: Object.assign({}, metadata, orderId ? { orderId } : {}),
  };

  const resp = await fetch('https://api.paystack.co/transaction/initialize', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${PAYSTACK_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const json = await resp.json();
  if (!resp.ok || !json || !json.status) {
    const errMsg =
      (json && (json.message || JSON.stringify(json))) ||
      `Paystack init failed (${resp.status})`;
    const err = new Error(errMsg);
    err.raw = json;
    throw err;
  }

  return {
    authorization_url: json.data.authorization_url,
    reference: json.data.reference,
    raw: json,
  };
}

/**
 * Verify a Paystack transaction by reference
 * @param {string} reference
 * @returns {Promise<{success:boolean, data:object, raw:object}>}
 */
async function verifyPaystack(reference) {
  if (!PAYSTACK_KEY) throw new Error('Paystack not configured');

  const resp = await fetch(
    `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${PAYSTACK_KEY}`,
      },
    }
  );
  const json = await resp.json();
  if (!resp.ok || !json || !json.status) {
    const err = new Error(
      `Paystack verify failed: ${json && json.message ? json.message : resp.status}`
    );
    err.raw = json;
    throw err;
  }
  // json.data contains payment data
  return {
    success:
      json.data.status === 'success' || json.data.status === 'successful',
    data: json.data,
    raw: json,
  };
}

/**
 * Initialize Flutterwave payment (v3/payments)
 * @param {{ amount:number|string, currency?:string, customer:{email, phonenumber, name} }} opts
 * @param {string} orderId
 * @returns {Promise<{payment_link, tx_ref, raw}>}
 */
async function initFlutterwave(
  { amount, currency = 'NGN', customer = {} },
  orderId = null
) {
  if (!FLW_KEY) throw new Error('Flutterwave not configured');

  const tx_ref = `mypadifood_${uuidv4()}`;

  const body = {
    tx_ref,
    amount: String(amount),
    currency,
    redirect_url: `${BASE_URL}/api/flutterwave/callback`,
    payment_options: 'card,banktransfer,ussd',
    customer: {
      email: customer.email || '',
      phonenumber: customer.phonenumber || '',
      name: customer.name || '',
    },
    meta: { orderId },
  };

  const resp = await fetch('https://api.flutterwave.com/v3/payments', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${FLW_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const json = await resp.json();
  if (
    !resp.ok ||
    !json ||
    (json.status !== 'success' && json.status !== 'pending')
  ) {
    const err = new Error(
      `Flutterwave init failed: ${json && json.message ? json.message : resp.status}`
    );
    err.raw = json;
    throw err;
  }

  // If successful the link is at json.data.link
  return { payment_link: json.data ? json.data.link : null, tx_ref, raw: json };
}

/**
 * Verify Flutterwave transaction by transaction id
 * @param {string} transaction_id
 * @returns {Promise<{success:boolean,data:object,raw:object}>}
 */
async function verifyFlutterwave(transaction_id) {
  if (!FLW_KEY) throw new Error('Flutterwave not configured');

  const resp = await fetch(
    `https://api.flutterwave.com/v3/transactions/${encodeURIComponent(transaction_id)}/verify`,
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${FLW_KEY}` },
    }
  );
  const json = await resp.json();
  if (
    !resp.ok ||
    !json ||
    (json.status !== 'success' && json.status !== 'completed')
  ) {
    const err = new Error(
      `Flutterwave verify failed: ${json && json.message ? json.message : resp.status}`
    );
    err.raw = json;
    throw err;
  }
  // json.data contains transaction info
  const success =
    json.data &&
    (json.data.status === 'successful' || json.data.status === 'success');
  return { success, data: json.data, raw: json };
}

/**
 * Verify Paystack webhook signature.
 * Paystack sends header "x-paystack-signature" which is HMAC-SHA512 of the raw body using your secret.
 * req.rawBody must be available (see server.js change).
 */
function verifyPaystackWebhook(req) {
  const header = String(req.headers['x-paystack-signature'] || '');
  if (!PAYSTACK_WEBHOOK_SECRET || !header) return false;

  // Ensure req.rawBody exists
  const raw =
    req.rawBody ||
    (req.body ? Buffer.from(JSON.stringify(req.body)) : Buffer.from(''));
  const hmac = crypto.createHmac('sha512', PAYSTACK_WEBHOOK_SECRET);
  const digest = hmac.update(raw).digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(header));
  } catch (e) {
    return false;
  }
}

/**
 * Verify Flutterwave webhook signature.
 * Flutterwave uses header "verif-hash" (older) or 'verif_hash' - the value is your webhook secret.
 * Implementation: compare header to your configured secret via timingSafeEqual.
 */
function verifyFlutterwaveWebhook(req) {
  const header = String(
    req.headers['verif-hash'] || req.headers['verif_hash'] || ''
  );
  if (!FLUTTERWAVE_WEBHOOK_SECRET || !header) return false;
  try {
    return crypto.timingSafeEqual(
      Buffer.from(header),
      Buffer.from(FLUTTERWAVE_WEBHOOK_SECRET)
    );
  } catch (e) {
    return false;
  }
}

module.exports = {
  initPaystack,
  verifyPaystack,
  initFlutterwave,
  verifyFlutterwave,
  verifyPaystackWebhook,
  verifyFlutterwaveWebhook,
};

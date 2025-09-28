// models/paymentModel.js
const { pool } = require("../database/database");

/**
 * Persist a provider payload for auditing.
 * raw should be a JSON-serializable object.
 */
async function createPayment({
  orderId = null,
  provider,
  event = null,
  providerReference = null,
  amount = null,
  currency = null,
  status = null,
  raw = {},
}) {
  const sql = `
    INSERT INTO payments (order_id, provider, event, provider_reference, amount, currency, status, raw)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    RETURNING *;
  `;
  const values = [orderId, provider, event, providerReference, amount, currency, status, raw];
  const { rows } = await pool.query(sql, values);
  return rows[0] || null;
}

async function findByProviderReference(provider, providerReference) {
  const sql = `SELECT * FROM payments WHERE provider = $1 AND provider_reference = $2 LIMIT 1`;
  const { rows } = await pool.query(sql, [provider, providerReference]);
  return rows[0] || null;
}

async function findByOrderId(orderId) {
  const { rows } = await pool.query(
    "SELECT * FROM payments WHERE order_id = $1 ORDER BY created_at DESC",
    [orderId]
  );
  return rows || [];
}

module.exports = {
  createPayment,
  findByProviderReference,
  findByOrderId,
};

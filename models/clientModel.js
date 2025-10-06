// models/clientModel.js
// Handles clients table: creation, lookup, simple read/update operations.

const { pool } = require('../database/database');

/**
 * Insert a new client and return the inserted id.
 * @param {Object} data - client data
 * @returns {Promise<string>} inserted client id
 */
async function createClient(data) {
  const {
    full_name,
    email,
    phone,
    state,
    lga,
    address,
    password_hash,
    latitude = null,
    longitude = null,
    location_source = 'manual',
  } = data;

  const sql = `
    INSERT INTO clients (
      full_name, email, phone, state, lga, address, password_hash, verified, wallet_balance, latitude, longitude, location_source
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,false,0,$8,$9,$10)
    RETURNING id;
  `;
  const values = [
    full_name,
    email,
    phone,
    state,
    lga,
    address,
    password_hash,
    latitude,
    longitude,
    location_source,
  ];
  const { rows } = await pool.query(sql, values);
  return rows[0].id;
}

/**
 * Find client by email.
 * @param {string} email
 * @returns {Promise<Object|null>}
 */
async function findByEmail(email) {
  const { rows } = await pool.query('SELECT * FROM clients WHERE email=$1', [
    email,
  ]);
  return rows[0] || null;
}

/**
 * Find client by id.
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
async function findById(id) {
  const { rows } = await pool.query('SELECT * FROM clients WHERE id=$1', [id]);
  return rows[0] || null;
}

/**
 * Mark client as verified (true).
 * @param {string} clientId
 * @returns {Promise<void>}
 */
async function setVerified(clientId) {
  await pool.query('UPDATE clients SET verified = true WHERE id=$1', [
    clientId,
  ]);
}

/**
 * Get client's state and lga (used for local vendor lookup).
 * @param {string} clientId
 * @returns {Promise<{state:string,lga:string}>}
 */
async function getLocation(clientId) {
  const { rows } = await pool.query(
    'SELECT state,lga FROM clients WHERE id=$1',
    [clientId]
  );
  return rows[0] || null;
}

/**
 * Return orders for a client with vendor name.
 * @param {string} clientId
 * @returns {Promise<Array>}
 */
async function getOrders(clientId) {
  const sql = `
    SELECT o.*, v.name AS vendor_name
    FROM orders o
    LEFT JOIN vendors v ON v.id = o.vendor_id
    WHERE o.client_id = $1
    ORDER BY o.created_at DESC
  `;
  const { rows } = await pool.query(sql, [clientId]);
  return rows;
}

async function updatePhone(clientId, newPhone) {
  const sql = `UPDATE clients SET phone=$1 WHERE id=$2 RETURNING *`;
  const { rows } = await pool.query(sql, [newPhone, clientId]);
  return rows[0] || null;
}

async function updateAddress(clientId, newAddress) {
  const sql = `UPDATE clients SET address=$1 WHERE id=$2 RETURNING *`;
  const { rows } = await pool.query(sql, [newAddress, clientId]);
  return rows[0] || null;
}

async function updatePassword(clientId, newHash) {
  const sql = `UPDATE clients SET password_hash=$1 WHERE id=$2 RETURNING *`;
  const { rows } = await pool.query(sql, [newHash, clientId]);
  return rows[0] || null;
}

module.exports = {
  createClient,
  findByEmail,
  findById,
  setVerified,
  getLocation,
  getOrders,
  updatePhone,
  updateAddress,
  updatePassword,
};

// models/vendorModel.js
// Encapsulates vendors table queries and helper filters.

const { pool } = require("../database/database");

// Strict UUID regex (36-character UUID with hyphens)
const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * Create a vendor registration (initially status = 'pending').
 */
async function createVendor(data) {
  const {
    name,
    state,
    lga,
    address,
    phone,
    email,
    food_item,
    base_price,
    latitude = null,
    longitude = null,
    location_source = "manual",
  } = data;
  const sql = `
    INSERT INTO vendors (
      name,state,lga,address,phone,email,food_item,base_price,status,latitude,longitude,location_source
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending',$9,$10,$11)
    RETURNING id;
  `;
  const { rows } = await pool.query(sql, [
    name,
    state,
    lga,
    address,
    phone,
    email,
    food_item,
    base_price || null,
    latitude,
    longitude,
    location_source,
  ]);
  return rows[0].id;
}

/**
 * Get approved vendors optionally filtered by state/lga/search q
 */
async function getApprovedVendors({ state = null, lga = null, q = null } = {}) {
  let sql =
    "SELECT id,name,food_item,base_price,address,state,lga,status FROM vendors WHERE status='approved'";
  const params = [];
  if (state) {
    params.push(state);
    sql += ` AND state=$${params.length}`;
  }
  if (lga) {
    params.push(lga);
    sql += ` AND lga=$${params.length}`;
  }
  if (q) {
    params.push(`%${q}%`);
    sql += ` AND (name ILIKE $${params.length} OR food_item ILIKE $${params.length})`;
  }
  const { rows } = await pool.query(sql, params);
  return rows;
}

/**
 * Find vendor by id (full record).
 * Defensive: validate UUID before sending to Postgres.
 */
async function findById(id) {
  if (!id || typeof id !== "string" || !uuidRegex.test(id)) {
    // invalid id — return null rather than letting Postgres try to cast it to UUID
    return null;
  }
  const { rows } = await pool.query("SELECT * FROM vendors WHERE id=$1", [id]);
  return rows[0] || null;
}

/**
 * Get pending vendors (for admin review)
 */
async function getPendingVendors() {
  const { rows } = await pool.query(
    "SELECT * FROM vendors WHERE status='pending' ORDER BY created_at DESC"
  );
  return rows;
}

/**
 * Update vendor status (approved/rejected)
 */
async function updateStatus(vendorId, status) {
  if (!vendorId || typeof vendorId !== "string" || !uuidRegex.test(vendorId)) {
    throw new Error("invalid vendorId");
  }
  await pool.query("UPDATE vendors SET status=$1 WHERE id=$2", [status, vendorId]);
}

module.exports = {
  createVendor,
  getApprovedVendors,
  findById,
  getPendingVendors,
  updateStatus,
};

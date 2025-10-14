// models/riderModel.js
const { pool } = require('../database/database');

const uuidRegex =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

async function createRider(data) {
  const {
    full_name,
    email,
    phone,
    state,
    lga,
    address,
    vehicle_type,
    vehicle_number,
    bank_name,
    account_number,
    password_hash,
    id_type,
    id_number,
    id_file,
    next_of_kin,
    base_fee = null,
    latitude = null,
    longitude = null,
    location_source = 'manual',
  } = data;

  const sql = `
    INSERT INTO riders (
      full_name,email,phone,state,lga,address,
      vehicle_type,vehicle_number,bank_name,account_number,password_hash,
      id_type,id_number,id_file,next_of_kin,base_fee,
      status,latitude,longitude,location_source,created_at,updated_at
    ) VALUES (
      $1,$2,$3,$4,$5,$6,
      $7,$8,$9,$10,$11,
      $12,$13,$14,$15,$16,
      'pending',$17,$18,$19, now(), now()
    )
    RETURNING id;
  `;
  const values = [
    full_name,
    email,
    phone,
    state,
    lga,
    address,
    vehicle_type,
    vehicle_number,
    bank_name,
    account_number,
    password_hash,
    id_type,
    id_number,
    id_file,
    next_of_kin,
    base_fee,
    latitude,
    longitude,
    location_source,
  ];
  const { rows } = await pool.query(sql, values);
  return rows[0].id;
}

async function getApprovedRiders({ state = null, lga = null } = {}) {
  let sql =
    "SELECT id, full_name, phone, email, state, lga, address, vehicle_type, vehicle_number, bank_name, account_number, status, base_fee, id_file FROM riders WHERE status = 'approved'";
  const params = [];
  if (state) {
    params.push(state);
    sql += ` AND state=$${params.length}`;
  }
  if (lga) {
    params.push(lga);
    sql += ` AND lga=$${params.length}`;
  }
  sql += ` ORDER BY created_at DESC`;
  const { rows } = await pool.query(sql, params);
  return rows;
}

async function getPendingRiders() {
  const { rows } = await pool.query(
    "SELECT * FROM riders WHERE status='pending' ORDER BY created_at DESC"
  );
  return rows;
}

/**
 * Update rider status and record reviewer + reason.
 * reviewedBy should be an admin UUID string (optional)
 */
async function updateStatus(
  riderId,
  status,
  reviewedBy = null,
  reviewReason = null
) {
  if (!riderId || typeof riderId !== 'string' || !uuidRegex.test(riderId)) {
    throw new Error('invalid riderId');
  }
  // Build dynamic query so reviewed_by/review_reason are nullable
  const sql = `
    UPDATE riders
    SET status = $1,
        reviewed_by = $2,
        reviewed_at = now(),
        review_reason = $3,
        updated_at = now()
    WHERE id = $4
    RETURNING id;
  `;
  const values = [status, reviewedBy || null, reviewReason || null, riderId];
  const { rows } = await pool.query(sql, values);
  return rows[0] || null;
}

async function findById(id) {
  if (!id || typeof id !== 'string' || !uuidRegex.test(id)) return null;
  const { rows } = await pool.query('SELECT * FROM riders WHERE id=$1', [id]);
  return rows[0] || null;
}

module.exports = {
  createRider,
  getApprovedRiders,
  getPendingRiders,
  updateStatus,
  findById,
};

// models/vendorModel.js
const db = require('./db');

exports.create = async ({
  user_id = null,
  name,
  address,
  lat = null,
  lng = null,
  food_item = null,
  price_min = null,
  phone = null,
  email = null,
  business_type = null,
  status = 'unverified'
}) => {
  const sql = `
    INSERT INTO vendors
      (user_id, name, address, lat, lng, food_item, price_min, phone, email, business_type, status)
    VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    RETURNING *
  `;
  const params = [user_id, name, address, lat, lng, food_item, price_min, phone, email, business_type, status];
  const r = await db.query(sql, params);
  return r.rows[0];
};

exports.getAll = async ({ verified_only = true } = {}) => {
  const sql = verified_only
    ? `SELECT * FROM vendors WHERE status='verified' ORDER BY created_at DESC`
    : `SELECT * FROM vendors ORDER BY created_at DESC`;
  const r = await db.query(sql);
  return r.rows;
};

exports.getById = async (id) => {
  const r = await db.query('SELECT * FROM vendors WHERE id=$1', [id]);
  return r.rows[0];
};

exports.verifyVendor = async (id, admin_id) => {
  const sql = `UPDATE vendors SET status='verified', verified_at=now(), verified_by=$2 WHERE id=$1 RETURNING *`;
  const r = await db.query(sql, [id, admin_id]);
  // insert into verifications_log
  await db.query(
    'INSERT INTO verifications_log (vendor_id, admin_id, notes, action) VALUES ($1,$2,$3,$4)',
    [id, admin_id, 'verified via admin panel', 'verify']
  );
  return r.rows[0];
};

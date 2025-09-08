// models/userModel.js
const db = require('./db');

exports.create = async ({ name, email, phone, password_hash, role = 'customer' }) => {
  const sql = `INSERT INTO users (name,email,phone,password_hash,role) VALUES ($1,$2,$3,$4,$5) RETURNING *`;
  const r = await db.query(sql, [name, email, phone, password_hash, role]);
  return r.rows[0];
};

exports.findByEmail = async (email) => {
  const r = await db.query('SELECT * FROM users WHERE email=$1', [email]);
  return r.rows[0];
};

exports.getById = async (id) => {
  const r = await db.query('SELECT id,name,email,phone,role,created_at FROM users WHERE id=$1', [id]);
  return r.rows[0];
};

exports.listAll = async () => {
  const r = await db.query('SELECT id,name,email,role,created_at FROM users ORDER BY created_at DESC');
  return r.rows;
};

exports.updateRole = async (id, role) => {
  const r = await db.query('UPDATE users SET role=$1 WHERE id=$2 RETURNING id,name,email,role', [role, id]);
  return r.rows[0];
};

// count admins helper
exports.countAdmins = async () => {
  const r = await db.query("SELECT COUNT(*)::int AS cnt FROM users WHERE role='admin'");
  return r.rows[0].cnt;
};

// delete user helper
exports.deleteById = async (id) => {
  const r = await db.query('DELETE FROM users WHERE id=$1 RETURNING id, email, role', [id]);
  return r.rows[0];
};

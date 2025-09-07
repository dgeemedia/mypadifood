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

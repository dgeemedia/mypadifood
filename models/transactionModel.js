const db = require('./db');

exports.create = async ({ wallet_id, type, amount, description = '' }) => {
  const r = await db.query('INSERT INTO transactions (wallet_id,type,amount,description) VALUES ($1,$2,$3,$4) RETURNING *', [wallet_id, type, amount, description]);
  return r.rows[0];
};

exports.getByWalletId = async (wallet_id) => {
  const r = await db.query('SELECT * FROM transactions WHERE wallet_id=$1 ORDER BY created_at DESC', [wallet_id]);
  return r.rows;
};

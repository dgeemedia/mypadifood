const db = require('./db');

exports.createForUser = async (user_id) => {
  const r = await db.query('INSERT INTO wallets (user_id,balance) VALUES ($1,$2) RETURNING *', [user_id, 0]);
  return r.rows[0];
};

exports.getByUserId = async (user_id) => {
  const r = await db.query('SELECT * FROM wallets WHERE user_id=$1', [user_id]);
  return r.rows[0];
};

exports.updateBalance = async (wallet_id, newBalance) => {
  const r = await db.query('UPDATE wallets SET balance=$2 WHERE id=$1 RETURNING *', [wallet_id, newBalance]);
  return r.rows[0];
};

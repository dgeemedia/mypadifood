const db = require('./db');

exports.create = async ({ customer_id, vendor_id, menu_item_id = null, amount, status = 'pending', pickup_time = null, payment_method = null }) => {
  const r = await db.query('INSERT INTO orders (customer_id,vendor_id,menu_item_id,amount,status,pickup_time) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *', [customer_id, vendor_id, menu_item_id, amount, status, pickup_time]);
  return r.rows[0];
};

exports.getByUser = async (userId) => {
  const r = await db.query('SELECT * FROM orders WHERE customer_id=$1 ORDER BY created_at DESC', [userId]);
  return r.rows;
};

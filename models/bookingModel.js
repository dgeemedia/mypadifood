const db = require('./db');

exports.create = async ({ customer_id = null, vendor_id, amount = 0, quantity = 1, status = 'pending', booking_date = null }) => {
  const r = await db.query('INSERT INTO bookings (customer_id,vendor_id,amount,quantity,status,booking_date) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *', [customer_id, vendor_id, amount, quantity, status, booking_date]);
  return r.rows[0];
};

const db = require('./db');

exports.listByVendor = async (vendor_id) => {
  const r = await db.query('SELECT * FROM menu_items WHERE vendor_id=$1', [vendor_id]);
  return r.rows;
};

exports.create = async ({ vendor_id, name, description, price }) => {
  const r = await db.query('INSERT INTO menu_items (vendor_id,name,description,price) VALUES ($1,$2,$3,$4) RETURNING *', [vendor_id, name, description, price]);
  return r.rows[0];
};

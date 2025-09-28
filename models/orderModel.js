// models/orderModel.js
const { pool } = require('../database/database');

/**
 * Create an order row.
 * Returns inserted id.
 */
async function createOrder({
  clientId,
  vendorId,
  item = null,
  payment_method = 'cod',
  total_amount = 0,
}) {
  const sql = `
    INSERT INTO orders (client_id, vendor_id, item, status, payment_method, total_amount)
    VALUES ($1,$2,$3,'pending',$4,$5)
    RETURNING id;
  `;
  const { rows } = await pool.query(sql, [
    clientId,
    vendorId,
    item,
    payment_method,
    total_amount,
  ]);
  return rows[0].id;
}

/**
 * Get orders by client with vendor name (used in client dashboard).
 */
async function getOrdersByClient(clientId) {
  const sql = `
    SELECT o.*, v.name AS vendor_name
    FROM orders o
    LEFT JOIN vendors v ON o.vendor_id = v.id
    WHERE o.client_id = $1
    ORDER BY o.created_at DESC
  `;
  const { rows } = await pool.query(sql, [clientId]);
  return rows;
}

/**
 * Assign an admin to an order and mark it as accepted.
 */
async function assignAdmin(orderId, adminId) {
  const sql = `UPDATE orders SET assigned_admin = $1, status = $2 WHERE id = $3 RETURNING *`;
  const { rows } = await pool.query(sql, [adminId, 'accepted', orderId]);
  return rows[0] || null;
}

/**
 * Update order status (generic helper).
 */
async function updateStatus(orderId, status) {
  const sql = `UPDATE orders SET status = $1 WHERE id = $2 RETURNING *`;
  const { rows } = await pool.query(sql, [status, orderId]);
  return rows[0] || null;
}

/**
 * Find order by id and include some related client/vendor fields.
 */
async function findById(id) {
  const sql = `
    SELECT o.*,
           c.full_name as client_name,
           c.phone as client_phone,
           c.address as client_address,
           v.name as vendor_name,
           v.address as vendor_address,
           v.phone as vendor_phone
    FROM orders o
    LEFT JOIN clients c ON o.client_id = c.id
    LEFT JOIN vendors v ON o.vendor_id = v.id
    WHERE o.id = $1
    LIMIT 1
  `;
  const { rows } = await pool.query(sql, [id]);
  return rows[0] || null;
}

/**
 * Get pending orders for the admin dashboard.
 */
async function getPendingOrdersForAdmin() {
  const sql = `
    SELECT o.*,
           c.full_name as client_name,
           c.phone as client_phone,
           c.address as client_address,
           v.name as vendor_name,
           v.phone as vendor_phone,
           v.address as vendor_address
    FROM orders o
    LEFT JOIN clients c ON o.client_id = c.id
    LEFT JOIN vendors v ON o.vendor_id = v.id
    WHERE o.status IN ('pending','accepted')     -- include active (pending + accepted)
    ORDER BY o.created_at DESC
  `;
  const { rows } = await pool.query(sql);
  return rows;
}

// models/orderModel.js (append)
async function getCompletedOrdersForAdmin() {
  const sql = `
    SELECT o.*,
           c.full_name as client_name,
           c.phone as client_phone,
           c.address as client_address,
           v.name as vendor_name,
           v.phone as vendor_phone,
           v.address as vendor_address
    FROM orders o
    LEFT JOIN clients c ON o.client_id = c.id
    LEFT JOIN vendors v ON o.vendor_id = v.id
    WHERE o.status = 'completed'
    ORDER BY o.updated_at DESC NULLS LAST, o.created_at DESC
  `;
  const { rows } = await pool.query(sql);
  return rows;
}

/**
 * Update payment metadata when initiating a payment (store provider + reference if known)
 * paymentProvider is e.g. 'paystack' or 'flutterwave'
 * providerReference is provider-specific reference/tx_ref (optional)
 */
async function updatePaymentInit(orderId, paymentProvider, providerReference) {
  const sql = `
    UPDATE orders
    SET payment_provider = $1, payment_reference = $2, payment_method = $3
    WHERE id = $4
  `;
  await pool.query(sql, [
    paymentProvider,
    providerReference || null,
    paymentProvider,
    orderId,
  ]);
}

/**
 * Mark order paid (called after successful verification)
 */
async function markPaid(orderId, paymentProvider, paymentReference) {
  const sql = `
    UPDATE orders
    SET status = 'paid', payment_provider = $1, payment_reference = $2, paid_at = NOW()
    WHERE id = $3
  `;
  await pool.query(sql, [paymentProvider, paymentReference, orderId]);
}

/**
 * Update the 'item' field (menu / order details) for an order.
 * orderId is likely a UUID string — pg will accept it as text.
 */
async function updateOrderItem(orderId, item) {
  const sql = `UPDATE orders SET item = $1 WHERE id = $2 RETURNING *`;
  const { rows } = await pool.query(sql, [item, orderId]);
  return rows[0] || null;
}

module.exports = {
  createOrder,
  getOrdersByClient,
  assignAdmin,
  updateStatus,
  findById,
  getPendingOrdersForAdmin,
  getCompletedOrdersForAdmin,
  updatePaymentInit,
  markPaid,
  updateOrderItem,
};

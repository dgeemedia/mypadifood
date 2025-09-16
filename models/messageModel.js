// models/messageModel.js
const { pool } = require('../database/database');

async function createMessage({ orderId, senderType, senderId = null, message, metadata = {} }) {
  const sql = `
    INSERT INTO order_messages (order_id, sender_type, sender_id, message, metadata)
    VALUES ($1,$2,$3,$4,$5)
    RETURNING *;
  `;
  const { rows } = await pool.query(sql, [orderId, senderType, senderId, message, metadata]);
  return rows[0];
}

async function getMessagesByOrder(orderId, limit = 200) {
  const sql = `
    SELECT id, order_id, sender_type, sender_id, message, metadata, read_by_admin, read_by_client, created_at
    FROM order_messages
    WHERE order_id = $1
    ORDER BY created_at ASC
    LIMIT $2
  `;
  const { rows } = await pool.query(sql, [orderId, limit]);
  return rows;
}

async function markReadByAdmin(orderId) {
  await pool.query('UPDATE order_messages SET read_by_admin = TRUE WHERE order_id = $1', [orderId]);
}

async function markReadByClient(orderId) {
  await pool.query('UPDATE order_messages SET read_by_client = TRUE WHERE order_id = $1', [orderId]);
}

module.exports = {
  createMessage,
  getMessagesByOrder,
  markReadByAdmin,
  markReadByClient
};

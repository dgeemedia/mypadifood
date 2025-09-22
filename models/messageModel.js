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

/**
 * Get messages for an order and attach helpful display fields:
 * - client_name: from orders -> clients
 * - admin_name: from admins when sender_type = 'admin'
 * - display_name: resolved name to show in UI (client | admin's name | Support)
 */
async function getMessagesByOrder(orderId, limit = 200) {
  const sql = `
    SELECT m.id,
           m.order_id,
           m.sender_type,
           m.sender_id,
           m.message,
           m.metadata,
           m.read_by_admin,
           m.read_by_client,
           m.created_at,
           o.client_id AS order_client_id,
           c.full_name AS client_name,
           a.name AS admin_name
    FROM order_messages m
    LEFT JOIN orders o ON o.id = m.order_id
    LEFT JOIN clients c ON o.client_id = c.id
    LEFT JOIN admins a ON a.id = m.sender_id
    WHERE m.order_id = $1
    ORDER BY m.created_at ASC
    LIMIT $2
  `;
  const { rows } = await pool.query(sql, [orderId, limit]);

  // attach display_name per message
  rows.forEach(msg => {
    if (msg.sender_type === 'client') {
      msg.display_name = msg.client_name || 'Client';
    } else if (msg.sender_type === 'admin') {
      msg.display_name = msg.admin_name || (msg.sender_id ? `Admin ${msg.sender_id}` : 'Admin');
    } else if (msg.sender_type === 'bot') {
      msg.display_name = 'Support';
    } else {
      msg.display_name = msg.sender_type || 'Unknown';
    }
  });

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

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
    SELECT om.*,
           o.client_id,
           c.full_name AS client_name,
           a.name AS admin_name
    FROM order_messages om
    LEFT JOIN orders o ON om.order_id = o.id
    LEFT JOIN clients c ON o.client_id = c.id
    LEFT JOIN admins a ON (om.sender_type = 'admin' AND om.sender_id = a.id)
    WHERE om.order_id = $1
    ORDER BY om.created_at ASC
    LIMIT $2
  `;
  const { rows } = await pool.query(sql, [orderId, limit]);

  // normalize fieldnames and attach display_name
  rows.forEach(msg => {
    // sender_type may be stored as 'client'|'admin'|'bot'
    if (msg.sender_type === 'client') {
      msg.display_name = msg.client_name || 'Client';
    } else if (msg.sender_type === 'admin') {
      msg.display_name = msg.admin_name || (msg.sender_id ? `Admin ${msg.sender_id}` : 'Admin');
    } else if (msg.sender_type === 'bot') {
      msg.display_name = 'Support';
    } else {
      msg.display_name = msg.sender_type || 'Unknown';
    }
    // also expose client_name/admin_name for templates if needed
    msg.client_name = msg.client_name || null;
    msg.admin_name = msg.admin_name || null;
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

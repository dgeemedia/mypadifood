// models/notificationModel.js
const { pool } = require("../database/database");

async function createNotification({ order_id = null, type = "order", payload = {} }) {
  const sql = `
    INSERT INTO admin_notifications (order_id, type, payload)
    VALUES ($1, $2, $3)
    RETURNING *;
  `;
  const { rows } = await pool.query(sql, [order_id, type, payload]);
  return rows[0];
}

async function getUnreadNotifications() {
  const { rows } = await pool.query(
    `SELECT * FROM admin_notifications WHERE read = false ORDER BY created_at DESC`
  );
  return rows;
}

async function markNotificationRead(id) {
  await pool.query(`UPDATE admin_notifications SET read = true WHERE id = $1`, [id]);
}

async function markAllRead() {
  await pool.query(`UPDATE admin_notifications SET read = true WHERE read = false`);
}

module.exports = {
  createNotification,
  getUnreadNotifications,
  markNotificationRead,
  markAllRead,
};

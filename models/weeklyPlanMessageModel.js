// models/weeklyPlanMessageModel.js
const { pool } = require('../database/database');

async function createMessage({
  weeklyPlanId,
  senderType,
  senderId = null,
  message,
  metadata = {},
}) {
  const sql = `
    INSERT INTO weekly_plan_messages (weekly_plan_order_id, sender_type, sender_id, message, metadata, created_at)
    VALUES ($1,$2,$3,$4,$5,NOW())
    RETURNING *;
  `;
  const values = [weeklyPlanId, senderType, senderId, message, metadata];
  const { rows } = await pool.query(sql, values);
  return rows[0] || null;
}

async function getMessagesByPlan(weeklyPlanId, limit = 500) {
  const sql = `
    SELECT m.*,
           COALESCE(c.full_name, a.name, 'Support') AS display_name
    FROM weekly_plan_messages m
    LEFT JOIN clients c ON (m.sender_type = 'client' AND m.sender_id = c.id)
    LEFT JOIN admins  a ON (m.sender_type = 'admin'  AND m.sender_id = a.id)
    WHERE m.weekly_plan_order_id = $1
    ORDER BY m.created_at ASC
    LIMIT $2
  `;
  const { rows } = await pool.query(sql, [weeklyPlanId, limit]);
  return rows || [];
}

async function markReadByAdmin(weeklyPlanId) {
  // placeholder — implement read flags if you have columns
  return true;
}

module.exports = {
  createMessage,
  getMessagesByPlan,
  markReadByAdmin,
};

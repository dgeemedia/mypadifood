// models/weeklyPlanModel.js
const { pool } = require('../database/database');

async function createWeeklyPlan({
  clientId,
  vendorId = null,
  weekOf, // 'YYYY-MM-DD' string or Date
  planType,
  totalPrice = 0,
  paymentMethod = null,
  modifiableFrom = null,
  modifiableUntil = null,
  items = [],
}) {
  const sql = `
    INSERT INTO weekly_plan_orders
      (client_id, vendor_id, week_of, plan_type, total_price, payment_method, modifiable_from, modifiable_until, status, created_at, updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending', NOW(), NOW())
    RETURNING *;
  `;
  const values = [
    clientId,
    vendorId,
    weekOf,
    planType,
    totalPrice,
    paymentMethod,
    modifiableFrom,
    modifiableUntil,
  ];
  const { rows } = await pool.query(sql, values);
  const order = rows[0];

  if (items && items.length) {
    const insertItemSql = `
      INSERT INTO weekly_plan_items (weekly_plan_order_id, day_of_week, slot, food_key, food_label, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,NOW(),NOW())
    `;
    for (const it of items) {
      await pool.query(insertItemSql, [
        order.id,
        it.day_of_week,
        it.slot || 1,
        it.food_key,
        it.food_label || it.food_key,
      ]);
    }
  }

  return order;
}

async function getPlansByClient(clientId) {
  const sql = `
    SELECT * FROM weekly_plan_orders
    WHERE client_id = $1
    ORDER BY week_of DESC, created_at DESC
  `;
  const { rows } = await pool.query(sql, [clientId]);
  return rows;
}

async function getPlanWithItems(planId) {
  const { rows } = await pool.query(
    'SELECT * FROM weekly_plan_orders WHERE id = $1',
    [planId]
  );
  const plan = rows[0] || null;
  if (!plan) return null;
  const itemsRes = await pool.query(
    'SELECT id, day_of_week, slot, food_key, food_label, created_at FROM weekly_plan_items WHERE weekly_plan_order_id = $1 ORDER BY day_of_week, slot',
    [planId]
  );
  plan.items = itemsRes.rows;
  return plan;
}

async function updatePlanItems(planId, items = []) {
  await pool.query(
    'DELETE FROM weekly_plan_items WHERE weekly_plan_order_id = $1',
    [planId]
  );
  const insertItemSql = `INSERT INTO weekly_plan_items (weekly_plan_order_id, day_of_week, slot, food_key, food_label, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,NOW(),NOW())`;
  for (const it of items) {
    await pool.query(insertItemSql, [
      planId,
      it.day_of_week,
      it.slot || 1,
      it.food_key,
      it.food_label || it.food_key,
    ]);
  }
  await pool.query(
    'UPDATE weekly_plan_orders SET updated_at = NOW() WHERE id = $1',
    [planId]
  );
  return getPlanWithItems(planId);
}

async function setPaymentStatus(planId, paymentStatus) {
  const { rows } = await pool.query(
    'UPDATE weekly_plan_orders SET payment_status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
    [paymentStatus, planId]
  );
  return rows[0] || null;
}

async function assignAdmin(planId, adminId) {
  const { rows } = await pool.query(
    'UPDATE weekly_plan_orders SET assigned_admin = $1, status = $2, updated_at = NOW() WHERE id = $3 RETURNING *',
    [adminId, 'accepted', planId]
  );
  return rows[0] || null;
}

async function updateStatus(planId, status) {
  const { rows } = await pool.query(
    'UPDATE weekly_plan_orders SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
    [status, planId]
  );
  return rows[0] || null;
}

async function getPendingPlansForAdmin() {
  const sql = `
    SELECT p.*, c.full_name as client_name, c.phone as client_phone, c.address as client_address, v.name as vendor_name
    FROM weekly_plan_orders p
    LEFT JOIN clients c ON p.client_id = c.id
    LEFT JOIN vendors v ON p.vendor_id = v.id
    WHERE p.status IN ('pending','accepted')
    ORDER BY p.created_at DESC
  `;
  const { rows } = await pool.query(sql);
  return rows;
}

async function getCompletedPlansForAdmin() {
  const sql = `
    SELECT p.*, c.full_name as client_name, c.phone as client_phone, c.address as client_address, v.name as vendor_name
    FROM weekly_plan_orders p
    LEFT JOIN clients c ON p.client_id = c.id
    LEFT JOIN vendors v ON p.vendor_id = v.id
    WHERE p.status = 'completed'
    ORDER BY COALESCE(p.updated_at, p.created_at) DESC NULLS LAST, p.created_at DESC
  `;
  const { rows } = await pool.query(sql);
  return rows;
}

module.exports = {
  createWeeklyPlan,
  getPlansByClient,
  getPlanWithItems,
  updatePlanItems,
  setPaymentStatus,
  assignAdmin,
  updateStatus,
  getPendingPlansForAdmin,
  getCompletedPlansForAdmin,
};

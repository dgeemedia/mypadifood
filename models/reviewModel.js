// models/reviewModel.js
const { pool } = require('../database/database');

async function createReview({
  vendorId,
  clientId = null,
  adminId = null,
  orderId = null,
  parentId = null,
  rating = null,
  comment = null,
  visible = true,
}) {
  const sql = `
    INSERT INTO reviews
      (vendor_id, client_id, admin_id, order_id, parent_id, rating, comment, visible)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    RETURNING *;
  `;
  const values = [
    vendorId,
    clientId,
    adminId,
    orderId,
    parentId,
    rating,
    comment,
    visible,
  ];
  const { rows } = await pool.query(sql, values);
  return rows[0];
}

/**
 * Return flat reviews for a vendor (top-level + replies).
 * We'll return all rows and let controller build a nested thread.
 */
async function getReviewsByVendor(vendorId) {
  const sql = `
    SELECT r.*, 
           c.full_name AS client_name, 
           a.name AS admin_name
    FROM reviews r
    LEFT JOIN clients c ON c.id = r.client_id
    LEFT JOIN admins a ON a.id = r.admin_id
    WHERE r.vendor_id = $1 AND r.visible = true
    ORDER BY r.created_at ASC
  `;
  const { rows } = await pool.query(sql, [vendorId]);
  return rows;
}

/**
 * Return a small summary (count + avg) for a single vendor.
 * avg_rating is rounded to 2 decimal places. If no ratings present, avg_rating will be 0.
 */
async function getRatingSummaryForVendor(vendorId) {
  const sql = `
    SELECT COUNT(*)::int AS review_count,
           COALESCE(ROUND(AVG(rating)::numeric,2), 0) AS avg_rating
    FROM reviews
    WHERE vendor_id = $1 AND visible = true;
  `;
  const { rows } = await pool.query(sql, [vendorId]);
  return rows[0] || { review_count: 0, avg_rating: 0 };
}

module.exports = {
  createReview,
  getReviewsByVendor,
  getRatingSummaryForVendor,
};

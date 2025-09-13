// routes/index.js - homepage that lists approved vendors and allows filter by location
const express = require('express');
const router = express.Router();
const { pool } = require('../database/database');

router.get('/', async (req, res) => {
  const { state, lga, q } = req.query;
  try {
    // default: all approved vendors
    let sql = "SELECT id,name,food_item,base_price,address,state,lga,status FROM vendors WHERE status='approved'";
    const params = [];

    if (state) {
      params.push(state);
      sql += ` AND state=$${params.length}`;
    }

    if (lga) {
      params.push(lga);
      sql += ` AND lga=$${params.length}`;
    }

    if (q) {
      // push the ILIKE pattern as a string
      params.push(`%${q}%`);
      // use the same parameter index for both name and food_item comparisons
      sql += ` AND (name ILIKE $${params.length} OR food_item ILIKE $${params.length})`;
    }

    const { rows } = await pool.query(sql, params);
    res.render('index', { vendors: rows, filters: { state, lga, q } });
  } catch (err) {
    console.error('Error fetching vendors:', err);
    res.render('index', { vendors: [], filters: {} });
  }
});

module.exports = router;

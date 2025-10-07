// routes/adminResources.js
const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const auth = require('../middleware/auth');

// Resources UI (render HTML) - accessible to admin/agent/food_specialist
router.get('/', auth.requireAdminOrAgent, adminController.resourcesPage);

// AJAX data endpoint - accessible to admin/agent/food_specialist
router.get('/data', auth.requireAdminOrAgent, adminController.resourcesData);

// CSV export - accessible to admin/agent/food_specialist
router.get('/export', auth.requireAdminOrAgent, adminController.resourcesExport);

/*
 * Admin-only riders review endpoints (same pattern as vendors)
 * - index of pending riders for review
 * - approve/reject action (POST)
 *
 * These are intentionally protected with requireAdmin (agents and super)
 * to match your existing vendors flow. If you want agents to be able to
 * approve/reject riders as well, change middleware to auth.requireAdminOrAgent.
 */
router.get('/riders/pending', auth.requireAdmin, adminController.pendingRiders);
router.post('/riders/decision', auth.requireAdmin, adminController.riderDecision);

module.exports = router;

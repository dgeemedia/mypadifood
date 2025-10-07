// routes/adminResources.js
const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const auth = require('../middleware/auth');

// Resources UI (render HTML)
router.get('/', auth.requireAdminOrAgent, adminController.resourcesPage);

// AJAX data endpoint
router.get('/data', auth.requireAdminOrAgent, adminController.resourcesData);

// CSV export
router.get('/export', auth.requireAdminOrAgent, adminController.resourcesExport);

// Pending rider applications (HTML page), review list
router.get('/riders/pending', auth.requireAdminOrAgent, adminController.pendingRiders);

// Approve / Reject rider (form POST)
router.post('/riders/decision', auth.requireAdminOrAgent, adminController.riderDecision);

module.exports = router;

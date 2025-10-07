// routes/adminResources.js
const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const auth = require('../middleware/auth'); // reuse your auth.requireAdmin if available

// render resources page (protected)
router.get('/', auth.requireAdmin, adminController.resourcesPage);

// API: return JSON list filtered by type,state,lga
router.get('/data', auth.requireAdmin, adminController.resourcesData);

module.exports = router;

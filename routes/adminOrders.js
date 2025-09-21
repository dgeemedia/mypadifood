// routes/adminOrders.js
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const adminController = require('../controllers/adminController');

// list pending orders (you already had counters; create listing)
router.get('/pending', auth.requireAdmin, adminController.pendingOrdersForAdmin);

// view single order page (with chat)
router.get('/:orderId', auth.requireAdmin, adminController.viewOrder);

// admin accept POST
router.post('/:orderId/accept', auth.requireAdmin, adminController.acceptOrder);

// mark order as completed (done)
router.post('/:orderId/done', auth.requireAdmin, adminController.completeOrder);
module.exports = router;

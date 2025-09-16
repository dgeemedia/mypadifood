// routes/chat.js
const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');

// POST new message (both client and admin can post)
router.post('/message', chatController.postMessage);

// GET messages for an order
router.get('/order/:orderId', chatController.getMessages);

module.exports = router;

// routes/chat.js
const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
const auth = require('../middleware/auth'); // optional auth helpers (may export requireAuthOptional)

// Order chat routes
router.post('/message', chatController.postMessage);
router.get('/order/:orderId', chatController.getMessages);

// Weekly plan chat (allow authenticated clients/admins; accept anonymous if your auth helper is absent)
const optionalAuthMiddleware =
  auth && auth.requireAuthOptional
    ? auth.requireAuthOptional
    : (req, res, next) => next();

router.post(
  '/weekly-plan/message',
  optionalAuthMiddleware,
  chatController.postWeeklyPlanMessage
);
router.get(
  '/weekly-plan/:planId',
  optionalAuthMiddleware,
  chatController.getWeeklyPlanMessages
);

module.exports = router;

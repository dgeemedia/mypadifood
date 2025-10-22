// routes/clientTransactions.js
const express = require('express');
const router = express.Router();
const controller = require('../controllers/clientTransactionsController');

router.get('/', controller.listClientTransactions); // GET /client/transactions

module.exports = router;

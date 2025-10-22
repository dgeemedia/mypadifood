// routes/wallet.js
const express = require('express');
const router = express.Router();
const walletCtrl = require('../controllers/walletController');

// Initialize a wallet top-up (AJAX). POST /client/wallet/init
router.post('/init', walletCtrl.initFund);

// Verify a payment and credit wallet if applicable. POST /client/wallet/verify
router.post('/verify', walletCtrl.verifyPayment);

module.exports = router;

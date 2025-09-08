// routes/wallet.js
const express = require('express');
const router = express.Router();
const wc = require('../controllers/walletController');
const { ensureAuth } = require('../utilities/authMiddleware');

router.get('/', ensureAuth, wc.portfolioPage);       // render page
router.get('/api', ensureAuth, wc.getWalletJson);    // JSON for AJAX
router.post('/topup', ensureAuth, wc.topup);         // mock topup

module.exports = router;

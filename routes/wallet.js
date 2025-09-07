const express = require('express');
const router = express.Router();
const wc = require('../controllers/walletController');

router.get('/:userId', wc.getWallet);
router.post('/topup', wc.topup);

module.exports = router;

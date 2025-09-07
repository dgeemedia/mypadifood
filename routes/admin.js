const express = require('express');
const router = express.Router();
const ac = require('../controllers/adminController');

router.get('/', ac.unverified);
router.post('/vendors/:id/verify', ac.verify);

module.exports = router;

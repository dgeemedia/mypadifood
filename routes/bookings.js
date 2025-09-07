const express = require('express');
const router = express.Router();
const bc = require('../controllers/bookingsController');

router.post('/', bc.create);

module.exports = router;

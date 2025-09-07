const express = require('express');
const router = express.Router();
const oc = require('../controllers/ordersController');

router.post('/', oc.create);

module.exports = router;

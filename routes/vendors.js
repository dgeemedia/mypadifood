const express = require('express');
const router = express.Router();
const vendors = require('../controllers/vendorsController');

router.get('/', vendors.list);
router.get('/new', vendors.showForm);
router.post('/', vendors.create);
router.get('/:id', vendors.get);

module.exports = router;

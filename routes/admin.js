// routes/admin.js
const express = require('express');
const router = express.Router();
const ac = require('../controllers/adminController');
const { ensureAuth, ensureAdmin } = require('../utilities/authMiddleware');

// vendor verification list (admin)
router.get('/', ensureAuth, ensureAdmin, ac.unverified);
router.post('/vendors/:id/verify', ensureAuth, ensureAdmin, ac.verify);

// manage users
router.get('/users', ensureAuth, ensureAdmin, ac.listUsers);
router.post('/users', ensureAuth, ensureAdmin, ac.createManager);
router.post('/users/:id/role', ensureAuth, ensureAdmin, ac.assignRole);

// delete user
router.post('/users/:id/delete', ensureAuth, ensureAdmin, ac.deleteUser);

module.exports = router;

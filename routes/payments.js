// routes/payments.js
const express = require('express');
const router = express.Router();

// These are stubs. Replace with real integration as needed.
router.post('/paystack/init', (req, res) => res.json({ ok: true, message: 'Paystack init stub' }));
router.get('/paystack/verify', (req, res) => res.json({ ok: true, message: 'Paystack verify stub' }));
router.post('/flutterwave/init', (req, res) => res.json({ ok: true, message: 'Flutterwave init stub' }));
router.get('/flutterwave/verify', (req, res) => res.json({ ok: true, message: 'Flutterwave verify stub' }));

module.exports = router;

// routes/contact.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const { body, validationResult } = require('express-validator');
const mailer = require('../utils/mailer');

// multer memory storage (we only forward the file as attachment — do not persist long-term)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

router.post(
  '/',
  upload.single('attachment'),
  [
    body('name').trim().isLength({ min: 2 }).withMessage('Please enter your name.'),
    body('email').isEmail().withMessage('Please enter a valid email address.'),
    body('subject').trim().isLength({ min: 3 }).withMessage('Please enter a subject.'),
    body('message').trim().isLength({ min: 6 }).withMessage('Please enter a message.'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const first = errors.array()[0].msg;
      return res.status(400).json({ error: first });
    }

    const { name, email, phone, subject, message } = req.body;
    // create message reference
    const reference = `MSG-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 900 + 100)}`;

    // prepare mail options
    const adminEmail = process.env.CONTACT_EMAIL || process.env.ADMIN_EMAIL || 'support@mypadifood.com';
    if (!adminEmail) {
      console.error('No contact email configured');
      return res.status(500).json({ error: 'Server misconfiguration' });
    }

    const attachments = [];
    if (req.file && req.file.buffer) {
      attachments.push({
        filename: req.file.originalname || 'attachment',
        content: req.file.buffer,
        contentType: req.file.mimetype || undefined,
        mimetype: req.file.mimetype || undefined,
      });
    }

    const html = `
      <h3>New contact message</h3>
      <p><strong>Reference:</strong> ${reference}</p>
      <p><strong>Name:</strong> ${name}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Phone:</strong> ${phone || '—'}</p>
      <p><strong>Subject:</strong> ${subject}</p>
      <p><strong>Message:</strong></p>
      <div style="white-space:pre-wrap; border-left:2px solid #eee; padding-left:8px; margin-top:6px;">${(message || '').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
      <p style="font-size:0.9rem; color:#666;">Sent from MyPadiFood site (${req.hostname}) — ${new Date().toISOString()}</p>
    `;

    try {
      const info = await mailer.sendMail({
        to: adminEmail,
        subject: `[Contact] ${subject} — ${reference}`,
        html,
        text: `${message}\n\nReference: ${reference}`,
        attachments,
        replyTo: email,
      });

      // if mailer returned fallback, still report success but warn
      if (info && info.fallback) {
        console.warn('Mailer used fallback logging for contact message', reference);
      }

      // optionally store the contact in DB here (not implemented)
      return res.json({ ok: true, reference });
    } catch (err) {
      console.error('Failed to send contact email', err && (err.message || err));
      return res.status(500).json({ error: 'Failed to send message. Please try again later.' });
    }
  }
);

module.exports = router;

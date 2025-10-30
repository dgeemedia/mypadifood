// routes/support.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const { body, validationResult } = require('express-validator');
const mailer = require('../utils/mailer'); // existing mailer util

// multer memory storage (we only forward the file as attachment — do not persist long-term)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

// Helper to detect HTML/form vs API requests
function isHtmlRequest(req) {
  const accept = (req.get('Accept') || '').toLowerCase();
  const contentType = (req.get('Content-Type') || '').toLowerCase();
  // treat browser form submissions or browsers expecting HTML as HTML requests
  if (accept.includes('text/html')) return true;
  if (contentType.includes('application/x-www-form-urlencoded')) return true;
  if (contentType.includes('multipart/form-data')) return true;
  return false;
}

// GET /support -> render same contact page (keeps compatibility with pages/contact.ejs)
router.get('/', (req, res) => {
  // allow templates to use res.locals for user/stats; pass title minimally
  res.render('pages/contact', { title: 'Support / Contact' });
});

// POST /support -> process same as /contact but support HTML redirect+flash
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
    // validation
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const first = errors.array()[0].msg;
      if (isHtmlRequest(req)) {
        // set flash and redirect back
        if (typeof req.flash === 'function') req.flash('error', first);
        else if (req.session) req.session.error = first;
        return res.redirect('/support');
      } else {
        return res.status(400).json({ error: first });
      }
    }

    const { name, email, phone, subject, message } = req.body;
    // create message reference
    const reference = `MSG-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 900 + 100)}`;

    // admin/support email
    const adminEmail = process.env.SUPPORT_EMAIL || process.env.ADMIN_EMAIL || process.env.CONTACT_EMAIL;
    if (!adminEmail) {
      console.error('SUPPORT/ADMIN email not set');
      if (isHtmlRequest(req)) {
        if (typeof req.flash === 'function') req.flash('error', 'Server misconfiguration (support email not set).');
        else if (req.session) req.session.error = 'Server misconfiguration (support email not set).';
        return res.redirect('/support');
      } else {
        return res.status(500).json({ error: 'Server misconfiguration' });
      }
    }

    const attachments = [];
    if (req.file && req.file.buffer) {
      attachments.push({
        filename: req.file.originalname || 'attachment',
        content: req.file.buffer,
      });
    }

    const html = `
      <h3>New support message</h3>
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
      await mailer.sendMail({
        to: adminEmail,
        subject: `[Support] ${subject} — ${reference}`,
        html,
        attachments,
      });

      // optionally store the contact in DB here (not implemented)

      if (isHtmlRequest(req)) {
        const successMsg = `Message sent — reference ${reference}`;
        if (typeof req.flash === 'function') req.flash('success', successMsg);
        else if (req.session) req.session.success = successMsg;
        return res.redirect('/support');
      } else {
        return res.json({ ok: true, reference });
      }
    } catch (err) {
      console.error('Failed to send support email', err);
      const errMsg = 'Failed to send message. Please try again later.';
      if (isHtmlRequest(req)) {
        if (typeof req.flash === 'function') req.flash('error', errMsg);
        else if (req.session) req.session.error = errMsg;
        return res.redirect('/support');
      } else {
        return res.status(500).json({ error: errMsg });
      }
    }
  }
);

module.exports = router;

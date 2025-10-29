// routes/careers.js
const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { sendMail } = require('../utils/mailer');

const router = express.Router();

// Ensure upload dir exists
const UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads', 'cvs');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '';
    const safe = file.originalname.replace(/[^a-z0-9.-]/gi, '_').toLowerCase();
    cb(null, `${Date.now()}_${Math.floor(Math.random()*9000)}_${safe}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } }); // 5MB

// GET careers page (optional)
router.get('/', (req, res) => {
  return res.render('pages/careers');
});

// POST apply (multipart/form)
router.post('/apply', upload.single('cvfile'), async (req, res) => {
  try {
    const { name, email, phone, cover, cvtext, role } = req.body;
    if (!name || !email || !phone || !role) {
      return res.status(400).json({ error: 'Missing required fields (name, email, phone, role).' });
    }

    // build public url to CV if uploaded (assumes you serve /uploads publicly)
    let cvUrl = null;
    if (req.file) {
      const filename = req.file.filename;
      const host = req.get('host');
      const proto = req.protocol;
      cvUrl = `${proto}://${host}/uploads/cvs/${filename}`;
    }

    // Send confirmation to applicant
    const applicantHtml = `
      <p>Hi ${name},</p>
      <p>Thank you for applying for the <strong>${role}</strong> role at MyPadiFood. We have received your application and CV. We'll review it and if your profile matches we'll contact you.</p>
      <p>Regards,<br/>MyPadiFood Hiring Team</p>
    `;
    // fire-and-forget but await so errors bubble
    try {
  await sendMail({
    to: email,
    subject: `Application received — ${role}`,
    text: `Thanks ${name}, we’ve received your application for ${role}. We will review it.`,
    html: applicantHtml,
    from: process.env.CAREERS_EMAIL || process.env.MAIL_FROM
  });
} catch (e) {
  console.error('Applicant confirmation email error:', e && e.message ? e.message : e);
}

    // Notify internal hiring inbox
    const internalTo = process.env.CAREERS_EMAIL || process.env.MAIL_TO || `careers@${process.env.APP_DOMAIN || 'mypadifood.com'}`;
    const internalHtml = `
      <p>New application for <strong>${role}</strong></p>
      <ul>
        <li>Name: ${name}</li>
        <li>Email: ${email}</li>
        <li>Phone: ${phone}</li>
        <li>Cover: ${cover ? cover.replace(/</g,'&lt;') : '(none)'}</li>
        <li>CV (text): ${cvtext ? cvtext.replace(/</g,'&lt;') : '(none)'}</li>
        <li>CV file: ${cvUrl || '(not uploaded)'}</li>
      </ul>
    `;
    try {
  await sendMail({
    to: internalTo,
    subject: `New applicant — ${role} — ${name}`,
    text: `${name} applied for ${role}`,
    html: internalHtml,
    from: process.env.CAREERS_EMAIL || process.env.MAIL_FROM
  });
} catch (e) {
  console.error('Internal notification email error:', e && e.message ? e.message : e);
}


    return res.json({ ok: true, message: "Thank you — we've received your application. Please check your email for a follow-up." });
  } catch (err) {
    console.error('Apply route error:', err);
    return res.status(500).json({ error: 'Server error while processing application.' });
  }
});

module.exports = router;

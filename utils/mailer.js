// utils/mailer.js
// Flexible mailer: supports SendGrid (API) OR SMTP (nodemailer) and falls back to console.
const nodemailer = require('nodemailer');

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || null;
const MAIL_SEND_METHOD = (process.env.MAIL_SEND_METHOD || '').toLowerCase(); // 'sendgrid' | 'smtp'
const mailFrom =
  process.env.MAIL_FROM ||
  `no-reply@${process.env.APP_DOMAIN || 'mypadifood.local'}`;

let smtpTransporter = null;
let smtpVerified = false;

// SendGrid helper (lazy require)
async function sendViaSendGrid({ to, subject, text, html, from }) {
  if (!SENDGRID_API_KEY) throw new Error('SENDGRID_API_KEY not configured');
  let sg;
  try {
    sg = require('@sendgrid/mail');
  } catch (e) {
    throw new Error('@sendgrid/mail package not installed');
  }
  sg.setApiKey(SENDGRID_API_KEY);
  const msg = { to, from: from || mailFrom, subject, text, html };
  try {
    const res = await sg.send(msg);
    return res;
  } catch (err) {
    if (err && err.response && err.response.body) {
      console.error('SendGrid response body:', JSON.stringify(err.response.body, null, 2));
    }
    throw err;
  }
}


function createSmtpTransporterFromEnv() {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : null;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !port || !user || !pass) return null;

  const secure = port === 465;
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
    requireTLS: !secure,
    tls: { rejectUnauthorized: false },
    connectionTimeout: 10_000,
    greetingTimeout: 5_000,
    socketTimeout: 10_000,
  });

  transporter
    .verify()
    .then(() => {
      smtpVerified = true;
      console.log('SMTP transporter verified.');
    })
    .catch((err) => {
      smtpVerified = false;
      console.error('SMTP verify failed:', err && err.message ? err.message : err);
    });

  return transporter;
}

function getSmtpTransporter() {
  if (smtpTransporter) return smtpTransporter;
  smtpTransporter = createSmtpTransporterFromEnv();
  return smtpTransporter;
}

/**
 * Send an email. Behavior:
 * - If MAIL_SEND_METHOD === 'smtp' => try SMTP only.
 * - If MAIL_SEND_METHOD === 'sendgrid' => try SendGrid only.
 * - If MAIL_SEND_METHOD unset => prefer SendGrid when key present, else SMTP if configured.
 * - Falls back to console logging if no transport available.
 */
async function sendMail({ to, subject, text = '', html = '', from = null }) {
  if (!to || !subject) throw new Error('sendMail requires `to` and `subject`');

  const effectiveFrom = from || mailFrom;

  // 1. Forced SMTP
  if (MAIL_SEND_METHOD === 'smtp') {
    const t = getSmtpTransporter();
    if (!t) throw new Error('SMTP transporter not configured (check env)');
    try {
      const info = await t.sendMail({ from: effectiveFrom, to, subject, text, html });
      if (info && info.messageId) console.log('Email sent via SMTP:', info.messageId);
      return info;
    } catch (smtpErr) {
      console.error('SMTP send failed:', smtpErr && smtpErr.message ? smtpErr.message : smtpErr);
      throw smtpErr;
    }
  }

  // 2. Forced SendGrid
  if (MAIL_SEND_METHOD === 'sendgrid') {
    try {
      return await sendViaSendGrid({ to, subject, text, html, from: effectiveFrom });
    } catch (sgErr) {
      console.error('SendGrid send failed:', sgErr && sgErr.message ? sgErr.message : sgErr);
      throw sgErr;
    }
  }

  // 3. Auto: prefer SendGrid if key present
  if (SENDGRID_API_KEY) {
    try {
      return await sendViaSendGrid({ to, subject, text, html, from: effectiveFrom });
    } catch (sgErr) {
      console.error('SendGrid send failed (falling back to SMTP):', sgErr && sgErr.message ? sgErr.message : sgErr);
      // fall through to SMTP attempt
    }
  }

  // 4. Try SMTP if available
  const t = getSmtpTransporter();
  if (t) {
    try {
      const info = await t.sendMail({ from: effectiveFrom, to, subject, text, html });
      if (info && info.messageId) console.log('Email sent via SMTP:', info.messageId);
      return info;
    } catch (smtpErr) {
      console.error('SMTP send failed:', smtpErr && smtpErr.message ? smtpErr.message : smtpErr);
      // fall through to console fallback
    }
  }

  // 5. Final fallback: console log (non-blocking)
  console.warn('No mail transport available — logging email to console (fallback).');
  console.log('=== EMAIL (fallback) ===');
  console.log('From:', effectiveFrom);
  console.log('To:', to);
  console.log('Subject:', subject);
  if (text) console.log('Text:', text);
  if (html) console.log('HTML:', html);
  console.log('=== END EMAIL ===');

  return { fallback: true };
}

module.exports = { sendMail };

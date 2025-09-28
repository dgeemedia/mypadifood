// utils/mailer.js
// Flexible mailer: supports SendGrid (API) OR SMTP (nodemailer) and falls back to console.
// Set MAIL_SEND_METHOD=sendgrid to force SendGrid, or MAIL_SEND_METHOD=smtp to force SMTP.
// If neither configured, falls back to console logging.

const nodemailer = require('nodemailer');

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || null;
const MAIL_SEND_METHOD = (process.env.MAIL_SEND_METHOD || '').toLowerCase(); // 'sendgrid' | 'smtp'
const mailFrom =
  process.env.MAIL_FROM ||
  `no-reply@${process.env.APP_DOMAIN || 'mypadifood.local'}`;

const sendGridClient = null;
let smtpTransporter = null;
let smtpVerified = false;

// Lazy require for SendGrid so project doesn't fail if lib missing
async function sendViaSendGrid({ to, subject, text, html }) {
  const sg = require('@sendgrid/mail');
  sg.setApiKey(SENDGRID_API_KEY);
  const msg = { to, from: mailFrom, subject, text, html };
  try {
    const res = await sg.send(msg);
    return res;
  } catch (err) {
    // Log full SendGrid response body (very helpful)
    if (err && err.response && err.response.body) {
      console.error(
        'SendGrid response body:',
        JSON.stringify(err.response.body, null, 2)
      );
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
    tls: { rejectUnauthorized: false },
    requireTLS: !secure,
  });

  // verify but don't throw — record result
  transporter
    .verify()
    .then(() => {
      smtpVerified = true;
      console.log('SMTP transporter verified.');
    })
    .catch((err) => {
      smtpVerified = false;
      console.error(
        'SMTP verify failed:',
        err && err.message ? err.message : err
      );
    });

  return transporter;
}

function getSmtpTransporter() {
  if (smtpTransporter) return smtpTransporter;
  smtpTransporter = createSmtpTransporterFromEnv();
  return smtpTransporter;
}

/**
 * Send an email. Attempts in this order:
 * 1) SendGrid (if configured or requested)
 * 2) SMTP (nodemailer)
 * 3) Console fallback
 */
async function sendMail({ to, subject, text = '', html = '' }) {
  if (!to || !subject) throw new Error('sendMail requires `to` and `subject`');

  // Prefer explicit method
  if (
    (MAIL_SEND_METHOD === 'sendgrid' || !MAIL_SEND_METHOD) &&
    SENDGRID_API_KEY
  ) {
    try {
      // dynamic require to avoid startup error when package missing
      return await sendViaSendGrid({ to, subject, text, html });
    } catch (sgErr) {
      console.error(
        'SendGrid send failed:',
        sgErr && sgErr.message ? sgErr.message : sgErr
      );
      // fall through to SMTP or console fallback
    }
  }

  // Try SMTP if configured
  const t = getSmtpTransporter();
  if (t) {
    try {
      const info = await t.sendMail({
        from: mailFrom,
        to,
        subject,
        text,
        html,
      });
      if (info && info.messageId)
        console.log('Email sent via SMTP:', info.messageId);
      return info;
    } catch (smtpErr) {
      console.error(
        'SMTP send failed:',
        smtpErr && smtpErr.message ? smtpErr.message : smtpErr
      );
      // fallthrough to console fallback
    }
  }

  // Final fallback: console log
  console.warn(
    'No working mail transport available — logging email to console (fallback).'
  );
  console.log('=== EMAIL (fallback) ===');
  console.log('From:', mailFrom);
  console.log('To:', to);
  console.log('Subject:', subject);
  if (text) console.log('Text:', text);
  if (html) console.log('HTML:', html);
  console.log('=== END EMAIL ===');

  return { fallback: true };
}

module.exports = { sendMail };

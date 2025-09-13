// utils/mailer.js
const nodemailer = require('nodemailer');

function createTransport() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT) || 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error('SMTP not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS in .env');
  }

  const secure = port === 465; // true for 465, false for 587/others
  const transport = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    tls: { rejectUnauthorized: false } // useful for some hosts; adjust for production
  });

  return transport;
}

async function sendMail({ to, subject, html, text, from }) {
  const transport = createTransport();
  const msg = {
    from: from || process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject,
    html,
    text
  };
  const info = await transport.sendMail(msg);
  // don't keep transport open in this script; nodemailer manages connection pooling internally
  return info;
}

module.exports = { sendMail };

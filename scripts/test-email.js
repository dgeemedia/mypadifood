// scripts/test-email.js
require('dotenv').config();
const { sendMail } = require('../utils/mailer');

async function main() {
  try {
    const res = await sendMail({
      to:
        process.env.SMTP_TEST_TO ||
        process.env.SMTP_USER ||
        'your.email@example.com',
      subject: 'MyPadiFood — test email',
      text: 'This is a test from MyPadiFood. If you see this, mailer works.',
      html: '<p>This is a test from <strong>MyPadiFood</strong>.</p>',
    });
    console.log('sendMail returned:', res);
  } catch (err) {
    console.error('Test email error:', err && err.message ? err.message : err);
  }
}

main();

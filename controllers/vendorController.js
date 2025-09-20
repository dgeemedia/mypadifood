// controllers/vendorController.js
const path = require('path');
const fs = require('fs');

const models = require('../models');
const vendorModel = models.vendor;

const { sendMail } = require('../utils/mailer');

function loadStatesLGAs() {
  try {
    const file = path.join(__dirname, '..', 'locations', 'Nigeria-State-Lga.json');
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.error('Could not load statesLGAs:', e);
  }
  return [];
}

// Render vendor registration form
exports.showRegisterForm = (req, res) => {
  const statesLGAs = loadStatesLGAs();
  return res.render('vendor/register', { statesLGAs });
};

exports.register = async (req, res) => {
  try {
    const {
      name,
      state,
      lga,
      address,
      phone,
      email,
      food_item,
      base_price,
      latitude,
      longitude,
      location_source
    } = req.body;

    const vendorId = await vendorModel.createVendor({
      name,
      state,
      lga,
      address,
      phone,
      email,
      food_item,
      base_price: base_price || null,
      latitude: latitude || null,
      longitude: longitude || null,
      location_source: location_source || 'manual'
    });

    if (email) {
      const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
      const subject = 'MyPadiFood vendor application received';
      const html = `
        <p>Hi ${name || 'Vendor'},</p>
        <p>Thanks for registering on MyPadiFood. We have received your vendor application and it is currently <strong>pending review</strong> by our team.</p>
        <p>What happens next:</p>
        <ul>
          <li>Our admin will review your application and documents.</li>
          <li>You'll receive an email when your application is approved or if more information is needed.</li>
        </ul>
        <p>If you have any questions, reply to this email or visit <a href="${baseUrl}">${baseUrl}</a>.</p>
        <p>Thank you for joining MyPadiFood.</p>
      `;
      const text = `Hello ${name || 'Vendor'},\n\nThanks for registering on MyPadiFood. Your application is pending review. We'll email you once it's approved.\n\nVisit: ${baseUrl}`;

      try {
        await sendMail({ to: email, subject, html, text });
      } catch (mailErr) {
        console.error('Failed to send vendor confirmation email (non-fatal):', mailErr && mailErr.message ? mailErr.message : mailErr);
      }
    }

    req.session.success = 'Vendor registration submitted. Await admin approval.';
    return res.redirect('/');
  } catch (err) {
    console.error('Error submitting vendor registration:', err);
    req.session.error = 'Error submitting vendor registration.';
    return res.redirect('/vendor/register');
  }
};

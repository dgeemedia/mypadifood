// controllers/vendorController.js
// Vendor registration UI + create vendor record
// Sends a confirmation email to the vendor after successful registration.
// Uses models.vendor and utils/mailer.sendMail (best-effort; email errors are logged).

const path = require('path');
const fs = require('fs');

const models = require('../models');
const vendorModel = models.vendor;

const { sendMail } = require('../utils/mailer'); // email helper

// Load states/LGAs JSON for dropdowns
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
  return res.render('vendor-register', { statesLGAs });
};

// Handle vendor registration: insert into vendors table (status: pending)
// and send confirmation email (best-effort).
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

    // create vendor (status defaults to 'pending')
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

    // Prepare email to vendor (if email provided)
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

      // best-effort send (do not fail registration if email can't be sent)
      try {
        await sendMail({ to: email, subject, html, text });
      } catch (mailErr) {
        // sendMail implementation already handles fallback/logging in many cases,
        // but catch here too to ensure vendor registration never fails due to email.
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

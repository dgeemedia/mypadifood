// controllers/vendorController.js
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const models = require('../models');
const vendorModel = models.vendor;
const reviewController = require('./reviewController');

const { sendMail } = require('../utils/mailer');

function loadStatesLGAs() {
  try {
    const file = path.join(
      __dirname,
      '..',
      'locations',
      'Nigeria-State-Lga.json'
    );
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.error('Could not load statesLGAs:', e);
  }
  return [];
}

// Render vendor registration form (reads preserved session form data/errors)
exports.showRegisterForm = (req, res) => {
  const statesLGAs = loadStatesLGAs();

  // read any preserved form data/errors placed by validation middleware
  const locals = req.session.form_data || {};
  const errors = req.session.form_errors || null;

  // clear one-time session fields so they don't persist
  if (req.session.form_data) delete req.session.form_data;
  if (req.session.form_errors) delete req.session.form_errors;

  return res.render('vendor/register', { statesLGAs, locals, errors });
};

// Handle vendor registration POST
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
      location_source,
    } = req.body;

    // create vendor (initial status = 'pending' inside model)
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
      location_source: location_source || 'manual',
    });

    // attempt to fetch canonical vendor record from DB (preferred)
    let vendor = null;
    try {
      vendor = await vendorModel.findById(vendorId);
    } catch (e) {
      // non-fatal — we'll fall back to a minimal vendor object below
      console.warn(
        'Could not load vendor after create (non-fatal):',
        e && e.message ? e.message : e
      );
    }

    // Fallback minimal vendor object for immediate UI if DB fetch failed
    if (!vendor) {
      vendor = {
        id: vendorId,
        name,
        state,
        lga,
        address,
        phone,
        email,
        food_item,
        base_price: base_price || null,
        status: 'pending',
      };
    }

    // Send confirmation email asynchronously (log errors but do not block the response)
    if (email) {
      const baseUrl =
        process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
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

      // fire-and-forget (don't await), but catch/log any errors
      sendMail({ to: email, subject, html, text }).catch((mailErr) => {
        console.error(
          'Failed to send vendor confirmation email (non-fatal):',
          mailErr && mailErr.message ? mailErr.message : mailErr
        );
      });
    }

    // Store a one-time session marker and redirect to the canonical thanks page
    // This prevents forging or repeatedly opening the thanks page.
    req.session.vendor_thanks_id = vendorId;

    // Option A: redirect to a protected /vendor/thanks route that will load the canonical record.
    // This keeps the UI flow consistent and ensures /vendor/thanks cannot be forged.
    return res.redirect('/vendor/thanks');

    // NOTE: If you prefer to render the thanks page immediately here (no redirect),
    // you could instead do: req.session.success = 'Vendor registration submitted...'; return res.render('vendor/thanks', { vendor });
    // But redirect approach is preferred for a clean one-time thanks page.
  } catch (err) {
    console.error('Error submitting vendor registration:', err);
    req.session.error = 'Error submitting vendor registration.';
    return res.redirect('/vendor/register');
  }
};

// GET /vendor/thanks — protected endpoint that requires the one-time session value
// Renders the canonical vendor record (loaded from DB). Consumes the session token.
exports.thanksPage = async (req, res) => {
  try {
    const vendorId = req.session.vendor_thanks_id;
    if (!vendorId) {
      req.session.error = 'Unable to show confirmation page.';
      return res.status(403).redirect('/vendor/register');
    }

    // Clear the session key so the page cannot be re-opened repeatedly
    delete req.session.vendor_thanks_id;

    // fetch vendor canonical record
    let vendor = null;
    try {
      vendor = await vendorModel.findById(vendorId);
    } catch (e) {
      console.warn(
        'Could not load vendor for thanks page:',
        e && e.message ? e.message : e
      );
      vendor = null;
    }

    if (!vendor) {
      // If the DB record is missing for some reason, show a minimal thanks experience instead of a hard failure
      // (but set an informative flash message)
      req.session.success =
        'Vendor registration submitted. Await admin approval.';
      const fallbackVendor = {
        id: vendorId,
        name: 'Vendor',
        address: '',
        status: 'pending',
      };
      return res.render('vendor/thanks', { vendor: fallbackVendor });
    }

    // Render the canonical vendor thanks page
    req.session.success =
      'Vendor registration submitted. Await admin approval.';
    return res.render('vendor/thanks', { vendor });
  } catch (err) {
    console.error('Error rendering vendor thanks page:', err);
    req.session.error = 'Could not show confirmation page.';
    return res.redirect('/');
  }
};

// Public vendor detail page (shows vendor + nested reviews + menu)
exports.show = async (req, res) => {
  try {
    const { id } = req.params;
    const vendor = await vendorModel.findById(id);
    if (!vendor) {
      req.session.error = 'Vendor not found';
      return res.redirect('/client/dashboard');
    }

    // --- Fetch menu items if available ---
    let menuItems = [];
    if (vendorModel.getMenuItemsByVendor) {
      try {
        menuItems = await vendorModel.getMenuItemsByVendor(id);
      } catch (e) {
        console.warn('Error loading menu items for vendor:', e);
        menuItems = [];
      }
    }

    // --- Fetch vendor reviews ---
    let reviews = [];
    try {
      reviews = await reviewController.getReviewsForVendor(id);
    } catch (e) {
      console.warn('Error loading reviews for vendor:', e);
      reviews = [];
    }

    // --- AI-generated description (for transparency) ---
    let aiDescription = `
      ${vendor.name} is a trusted food vendor on MyPadiFood serving delicious meals across ${vendor.state || 'Nigeria'}. 
      Known for quality service and consistent taste, ${vendor.name} delivers satisfying meals to customers near ${vendor.lga || 'your area'}.
      This description was automatically generated by MyPadiFood AI for transparency.
    `;

    // --- Render page ---
    return res.render('vendor/show', {
      title: vendor.name || 'Vendor',
      vendor,
      menuItems,
      reviews,
      aiDescription,
      currentUser: res.locals.currentUser || req.session.user || null,
    });
  } catch (err) {
    console.error('Error rendering vendor show page:', err);
    req.session.error = 'Error loading vendor page';
    return res.redirect('/client/dashboard');
  }
};

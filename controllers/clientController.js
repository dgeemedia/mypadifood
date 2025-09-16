// controllers/clientController.js
// Client registration, verification, login, dashboard and booking (uses models)
// Uses sendMail from utils/mailer.js to send verification emails (best-effort)

const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

const models = require('../models');
const clientModel = models.client;
const verificationModel = models.verification;
const vendorModel = models.vendor;
const orderModel = models.order;

const { sendMail } = require('../utils/mailer'); // <- email helper

const SALT_ROUNDS = 10;
const VERIFICATION_TOKEN_TTL_HOURS = 48;

// helper to load states/LGAs JSON for forms
function loadStatesLGAs() {
  try {
    const file = path.join(__dirname, '..', 'locations', 'Nigeria-State-Lga.json');
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.error('Could not load statesLGAs:', e);
  }
  return [];
}

// Show registration page
exports.showRegister = (req, res) => {
  const statesLGAs = loadStatesLGAs();
  return res.render('client-register', { statesLGAs });
};

// Handle registration: create client row + verification token + send email
exports.register = async (req, res) => {
  const {
    full_name, email, phone, state, lga, address, password,
    latitude, longitude, location_source
  } = req.body;

  try {
    const hash = await bcrypt.hash(password, SALT_ROUNDS);

    const clientId = await clientModel.createClient({
      full_name,
      email,
      phone,
      state,
      lga,
      address,
      password_hash: hash,
      latitude: latitude || null,
      longitude: longitude || null,
      location_source: location_source || 'manual'
    });

    // create verification token
    const token = uuidv4();
    const expiresAt = new Date(Date.now() + VERIFICATION_TOKEN_TTL_HOURS * 3600 * 1000);
    await verificationModel.createToken(token, clientId, expiresAt);

    // send verification email (best effort)
    const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
    const verifyLink = `${baseUrl}/client/verify?token=${token}`;

    // DEV HELP: store verification link on session so devs can click it if email delivery fails
    if (process.env.SHOW_DEV_VERIFICATION === 'true') {
      req.session.verification_link = verifyLink;
    }

    const subject = 'Verify your MyPadiFood account';
    const html = `<p>Hi ${full_name || 'there'},</p><p>Please verify your account: <a href="${verifyLink}">${verifyLink}</a></p>`;
    const text = `Verify your account: ${verifyLink}`;

    try {
      await sendMail({ to: email, subject, html, text });
      req.session.success = 'Registration successful. A verification email has been sent to your email address.';
    } catch (mailErr) {
      console.error('Error sending verification email:', mailErr);
      req.session.success = 'Registration created. We could not send verification email — contact support.';
    }

    return res.redirect('/client/login');
  } catch (err) {
    console.error('Error in client register:', err);
    req.session.error = 'Error registering client; email may already exist.';
    return res.redirect('/client/register');
  }
};

// Verify email: consume token, mark client verified
// Optional auto-login via AUTO_LOGIN_ON_VERIFY env var (default off)
exports.verifyEmail = async (req, res) => {
  const { token } = req.query;
  if (!token) {
    req.session.error = 'Invalid verification link.';
    return res.redirect('/');
  }

  try {
    const row = await verificationModel.findToken(token);
    if (!row) {
      req.session.error = 'Invalid or expired verification link.';
      return res.redirect('/');
    }

    if (row.expires_at && new Date(row.expires_at) < new Date()) {
      // expired — delete and inform
      await verificationModel.deleteToken(token);
      req.session.error = 'Verification link expired. Please register again or contact support.';
      return res.redirect('/');
    }

    // mark verified and consume token
    await clientModel.setVerified(row.client_id);
    await verificationModel.deleteToken(token);

    // Auto-login option (controlled by env)
    const AUTO_LOGIN = String(process.env.AUTO_LOGIN_ON_VERIFY || '').toLowerCase() === 'true';
    if (AUTO_LOGIN) {
      try {
        const user = await clientModel.findById(row.client_id);
        if (user) {
          req.session.user = { id: user.id, type: 'client', name: user.full_name, email: user.email };
          req.session.success = 'Email verified — you are now logged in.';
          return res.redirect('/client/dashboard');
        }
      } catch (loginErr) {
        console.error('Auto-login after verification failed:', loginErr);
        // fall back to normal flow below
      }
    }

    // default: redirect to login with success message
    req.session.success = 'Email verified successfully. You can now log in.';
    return res.redirect('/client/login');
  } catch (err) {
    console.error('Error verifying email:', err);
    req.session.error = 'Verification failed due to server error.';
    return res.redirect('/');
  }
};

/**
 * Resend verification token to a client.
 * - If user is logged in as client, uses session user id.
 * - Otherwise accepts { email } in POST body to find the account.
 * - Throttles resends using getLatestTokenForClient() from verification model.
 * - Stores dev-only verification_link in session when SHOW_DEV_VERIFICATION === 'true'.
 */
exports.resendVerification = async (req, res) => {
  try {
    // Find client by session or by posted email
    const emailFromBody = (req.body && req.body.email) ? String(req.body.email).trim() : null;
    let client = null;

    if (req.session && req.session.user && req.session.user.type === 'client') {
      client = await clientModel.findById(req.session.user.id);
    } else if (emailFromBody) {
      client = await clientModel.findByEmail(emailFromBody);
    } else {
      req.session.error = 'Please provide an email address to resend verification.';
      return res.redirect('/client/login');
    }

    if (!client) {
      req.session.error = 'Account not found for that email.';
      return res.redirect('/client/login');
    }

    if (client.verified) {
      req.session.success = 'Your account is already verified. Please log in.';
      return res.redirect('/client/login');
    }

    // Throttle: require a minimum interval between resends
    const COOLDOWN_MINUTES = Number(process.env.RESEND_VERIFICATION_COOLDOWN_MINUTES || 10);
    const latest = await verificationModel.getLatestTokenForClient(client.id);
    if (latest && latest.created_at) {
      const elapsedMs = Date.now() - new Date(latest.created_at).getTime();
      const cooldownMs = COOLDOWN_MINUTES * 60 * 1000;
      if (elapsedMs < cooldownMs) {
        const waitSec = Math.ceil((cooldownMs - elapsedMs) / 1000);
        req.session.error = `Please wait ${waitSec} seconds before requesting another verification email.`;
        return res.redirect('/client/login');
      }
    }

    // Create new token and send email
    const token = uuidv4();
    const expiresAt = new Date(Date.now() + VERIFICATION_TOKEN_TTL_HOURS * 3600 * 1000);
    await verificationModel.createToken(token, client.id, expiresAt);

    const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
    const verifyLink = `${baseUrl}/client/verify?token=${token}`;

    // DEV HELP: store verification link on session so devs can click it if email delivery fails
    if (process.env.SHOW_DEV_VERIFICATION === 'true') {
      req.session.verification_link = verifyLink;
    }

    const subject = 'MyPadiFood — Verify your account';
    const html = `<p>Hi ${client.full_name || 'there'},</p>
                  <p>Please verify your account by clicking the link below:</p>
                  <p><a href="${verifyLink}">${verifyLink}</a></p>
                  <p>This link expires in ${VERIFICATION_TOKEN_TTL_HOURS} hours.</p>`;
    const text = `Verify your account: ${verifyLink}`;

    try {
      await sendMail({ to: client.email, subject, html, text });
      req.session.success = 'A verification link has been sent to your email address. Check your inbox (and spam folder).';
    } catch (mailErr) {
      console.error('Failed to send verification email (resend):', mailErr && mailErr.message ? mailErr.message : mailErr);
      // Generic message — don't leak internal details to user
      req.session.success = 'We could not send the verification email. Please contact support if the problem persists.';
    }

    return res.redirect('/client/login');
  } catch (err) {
    console.error('resendVerification error:', err);
    req.session.error = 'Could not resend verification link at this time.';
    return res.redirect('/client/login');
  }
};

// Show login page (client)
exports.showLogin = (req, res) => {
  return res.render('login', { userType: 'client' });
};

// Handle login; if unverified, resend token
exports.login = async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await clientModel.findByEmail(email);
    if (!user) {
      req.session.error = 'Invalid credentials';
      return res.redirect('/client/login');
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      req.session.error = 'Invalid credentials';
      return res.redirect('/client/login');
    }

    if (!user.verified) {
      // create & send verification token
      const token = uuidv4();
      const expiresAt = new Date(Date.now() + VERIFICATION_TOKEN_TTL_HOURS * 3600 * 1000);
      await verificationModel.createToken(token, user.id, expiresAt);

      const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
      const verifyLink = `${baseUrl}/client/verify?token=${token}`;

      // DEV HELP: store verification link on session so devs can click it if email delivery fails
      if (process.env.SHOW_DEV_VERIFICATION === 'true') {
        req.session.verification_link = verifyLink;
      }

      try {
        await sendMail({
          to: user.email,
          subject: 'Verify your account (reminder)',
          html: `<p>Click <a href="${verifyLink}">here</a> to verify. It expires in ${VERIFICATION_TOKEN_TTL_HOURS} hours.</p>`,
          text: verifyLink
        });
      } catch (e) {
        console.error('Error sending reminder verification email:', e);
      }

      req.session.error = 'Email not verified. A verification link was sent to your email.';
      return res.redirect('/client/login');
    }

    // Successful login
    req.session.user = { id: user.id, type: 'client', name: user.full_name, email: user.email };
    req.session.success = `Welcome back, ${user.full_name}`;
    return res.redirect('/client/dashboard');
  } catch (err) {
    console.error('Error in client login:', err);
    req.session.error = 'Login failed';
    return res.redirect('/client/login');
  }
};

// Logout client
exports.logout = (req, res) => {
  req.session.destroy(err => {
    if (err) console.error('Logout error', err);
    res.clearCookie('connect.sid');
    res.redirect('/');
  });
};

// Client dashboard: show local vendors and client orders
exports.dashboard = async (req, res) => {
  try {
    const clientId = req.session.user.id;
    const client = await clientModel.findById(clientId);
    if (!client) {
      req.session.error = 'Client not found';
      return res.redirect('/');
    }

    const vendors = await vendorModel.getApprovedVendors({ state: client.state, lga: client.lga });
    const orders = await orderModel.getOrdersByClient(clientId);

    return res.render('client-dashboard', { vendors, orders });
  } catch (err) {
    console.error('Error loading client dashboard:', err);
    req.session.error = 'Error loading dashboard';
    return res.redirect('/');
  }
};

// Book a vendor (create order)
exports.bookVendor = async (req, res) => {
  try {
    if (!req.session || !req.session.user || req.session.user.type !== 'client') {
      req.session.error = 'Please log in to place an order.';
      return res.redirect('/client/login');
    }

    const clientId = req.session.user.id;
    const { vendorId, item, payment_method } = req.body;
    const vendor = await vendorModel.findById(vendorId);
    const client = await clientModel.findById(clientId);
    const price = vendor ? vendor.base_price : 0;

    // create order
    const orderId = await orderModel.createOrder({
      clientId,
      vendorId,
      item: item || null,
      payment_method: payment_method || 'cod',
      total_amount: price
    });

    // create initial client summary message
    const messageSummary = `Booking request: Client: ${client.full_name || ''} | Phone: ${client.phone || ''} | Address: ${client.address || ''} | Vendor: ${vendor ? vendor.name : ''} | Item: ${item || ''} | Payment: ${payment_method || 'cod'}`;
    const createdMsg = await models.message.createMessage({
      orderId,
      senderType: 'client',
      senderId: clientId,
      message: messageSummary,
      metadata: {}
    });

    // bot prompt message asking yes/no
    const botPrompt = `Would you like to modify this request? Please select Yes or No.`;
    const botPromptMsg = await models.message.createMessage({
      orderId,
      senderType: 'bot',
      senderId: null,
      message: botPrompt,
      metadata: { vendorName: vendor ? vendor.name : null }
    });

    // Emit notifications via socket.io:
    const io = require('../utils/socket').get();
    // 1) notify admins of a new order (send concise order details)
    if (io) {
      const orderSummary = {
        id: orderId,
        client_id: clientId,
        client_name: client.full_name,
        client_phone: client.phone,
        vendor_id: vendorId,
        vendor_name: vendor ? vendor.name : null,
        item: item || null,
        total_amount: price,
        created_at: new Date()
      };
      io.to('admins').emit('new_order', orderSummary);

      // 2) notify admins of the initial message(s)
      io.to('admins').emit('order_message', { orderId, message: createdMsg });
      io.to('admins').emit('order_message', { orderId, message: botPromptMsg });

      // 3) emit to order room so any joined participants see messages too
      io.to(`order_${orderId}`).emit('new_message', createdMsg);
      io.to(`order_${orderId}`).emit('new_message', botPromptMsg);
    }

    req.session.success = 'Booking request created. Check your dashboard for chat options to add a modification (if any).';
    return res.redirect('/client/dashboard');
  } catch (err) {
    console.error('Error creating booking:', err);
    req.session.error = 'Error creating booking';
    return res.redirect('/client/dashboard');
  }
};

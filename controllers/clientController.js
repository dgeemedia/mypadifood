// controllers/clientController.js
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

const models = require('../models');
const clientModel = models.client;
const verificationModel = models.verification;
const vendorModel = models.vendor;
const orderModel = models.order;

const { sendMail } = require('../utils/mailer');

const SALT_ROUNDS = 10;
const VERIFICATION_TOKEN_TTL_HOURS = 48;

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

// Show registration page (preserve any previous form data/errors)
exports.showRegister = (req, res) => {
  const statesLGAs = loadStatesLGAs();

  // read preserved form data and errors set by validation middleware (if any)
  const locals = req.session.form_data || {};
  const errors = req.session.form_errors || null;

  // clear them so they don't persist (one-time)
  if (req.session.form_data) delete req.session.form_data;
  if (req.session.form_errors) delete req.session.form_errors;

  return res.render('client/register', { statesLGAs, locals, errors });
};

// Show resend verification form
exports.showResendForm = (req, res) => {
  // simple form rendering
  return res.render('client/resend-verification');
};

// Handle registration
exports.register = async (req, res) => {
  const {
    full_name,
    email,
    phone,
    state,
    lga,
    address,
    password,
    latitude,
    longitude,
    location_source,
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
      location_source: location_source || 'manual',
    });

    const token = uuidv4();
    const expiresAt = new Date(
      Date.now() + VERIFICATION_TOKEN_TTL_HOURS * 3600 * 1000
    );
    await verificationModel.createToken(token, clientId, expiresAt);

    const baseUrl =
      process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
    const verifyLink = `${baseUrl}/client/verify?token=${token}`;

    if (process.env.SHOW_DEV_VERIFICATION === 'true') {
      req.session.verification_link = verifyLink;
    }

    const subject = 'Verify your MyPadiFood account';
    const html = `<p>Hi ${full_name || 'there'},</p><p>Please verify your account: <a href="${verifyLink}">${verifyLink}</a></p>`;
    const text = `Verify your account: ${verifyLink}`;

    try {
      await sendMail({ to: email, subject, html, text });
      req.session.success =
        'Registration successful. A verification email has been sent to your email address.';
    } catch (mailErr) {
      console.error('Error sending verification email:', mailErr);
      req.session.success =
        'Registration created. We could not send verification email — contact support.';
    }

    return res.redirect('/client/login');
  } catch (err) {
    console.error('Error in client register:', err);
    req.session.error = 'Error registering client; email may already exist.';
    return res.redirect('/client/register');
  }
};

// Verify email
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
      await verificationModel.deleteToken(token);
      req.session.error =
        'Verification link expired. Please register again or contact support.';
      return res.redirect('/');
    }

    await clientModel.setVerified(row.client_id);
    await verificationModel.deleteToken(token);

    const AUTO_LOGIN =
      String(process.env.AUTO_LOGIN_ON_VERIFY || '').toLowerCase() === 'true';
    if (AUTO_LOGIN) {
      try {
        const user = await clientModel.findById(row.client_id);
        if (user) {
          req.session.user = {
            id: user.id,
            type: 'client',
            name: user.full_name,
            email: user.email,
          };
          req.session.success = 'Email verified — you are now logged in.';
          return res.redirect('/client/dashboard');
        }
      } catch (loginErr) {
        console.error('Auto-login after verification failed:', loginErr);
      }
    }

    req.session.success = 'Email verified successfully. You can now log in.';
    return res.redirect('/client/login');
  } catch (err) {
    console.error('Error verifying email:', err);
    req.session.error = 'Verification failed due to server error.';
    return res.redirect('/');
  }
};

// Resend verification
exports.resendVerification = async (req, res) => {
  try {
    const emailFromBody =
      req.body && req.body.email ? String(req.body.email).trim() : null;
    let client = null;

    if (req.session && req.session.user && req.session.user.type === 'client') {
      client = await clientModel.findById(req.session.user.id);
    } else if (emailFromBody) {
      client = await clientModel.findByEmail(emailFromBody);
    } else {
      req.session.error =
        'Please provide an email address to resend verification.';
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

    const COOLDOWN_MINUTES = Number(
      process.env.RESEND_VERIFICATION_COOLDOWN_MINUTES || 10
    );
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

    const token = uuidv4();
    const expiresAt = new Date(
      Date.now() + VERIFICATION_TOKEN_TTL_HOURS * 3600 * 1000
    );
    await verificationModel.createToken(token, client.id, expiresAt);

    const baseUrl =
      process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
    const verifyLink = `${baseUrl}/client/verify?token=${token}`;

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
      req.session.success =
        'A verification link has been sent to your email address. Check your inbox (and spam folder).';
    } catch (mailErr) {
      console.error(
        'Failed to send verification email (resend):',
        mailErr && mailErr.message ? mailErr.message : mailErr
      );
      req.session.success =
        'We could not send the verification email. Please contact support if the problem persists.';
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
  // If a dev verification link was placed in session, grab it and remove it immediately
  const verification_link = req.session.verification_link || null;
  if (req.session.verification_link) delete req.session.verification_link;
  return res.render('client/login', { userType: 'client', verification_link });
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
      const token = uuidv4();
      const expiresAt = new Date(
        Date.now() + VERIFICATION_TOKEN_TTL_HOURS * 3600 * 1000
      );
      await verificationModel.createToken(token, user.id, expiresAt);

      const baseUrl =
        process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
      const verifyLink = `${baseUrl}/client/verify?token=${token}`;

      if (process.env.SHOW_DEV_VERIFICATION === 'true') {
        req.session.verification_link = verifyLink;
      }

      try {
        await sendMail({
          to: user.email,
          subject: 'Verify your account (reminder)',
          html: `<p>Click <a href="${verifyLink}">here</a> to verify. It expires in ${VERIFICATION_TOKEN_TTL_HOURS} hours.</p>`,
          text: verifyLink,
        });
      } catch (e) {
        console.error('Error sending reminder verification email:', e);
      }

      req.session.error =
        'Email not verified. A verification link was sent to your email.';
      return res.redirect('/client/login');
    }

    req.session.user = {
      id: user.id,
      type: 'client',
      name: user.full_name,
      email: user.email,
    };
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
  req.session.destroy((err) => {
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

    const vendors = await vendorModel.getApprovedVendors({
      state: client.state,
      lga: client.lga,
    });
    const orders = await orderModel.getOrdersByClient(clientId);

    // Pull recent order id from session (set at booking time) — then remove it so it only triggers once
    const recentOrderId = req.session.recent_order_id || null;
    if (req.session.recent_order_id) delete req.session.recent_order_id;

    return res.render('client/dashboard', { vendors, orders, recentOrderId });
  } catch (err) {
    console.error('Error loading client dashboard:', err);
    req.session.error = 'Error loading dashboard';
    return res.redirect('/');
  }
};

// Client posts menu/update to an existing order (so admin sees it)
exports.postOrderMenu = async (req, res) => {
  try {
    if (
      !req.session ||
      !req.session.user ||
      req.session.user.type !== 'client'
    ) {
      req.session.error = 'Please log in to update your order.';
      return res.redirect('/client/login');
    }

    const clientId = req.session.user.id;
    const { orderId } = req.params;
    const { menu_text } = req.body; // free text menu / instructions

    const order = await orderModel.findById(orderId);
    if (!order) {
      req.session.error = 'Order not found';
      return res.redirect('/client/dashboard');
    }
    if (String(order.client_id) !== String(clientId)) {
      req.session.error = 'Not authorized';
      return res.redirect('/client/dashboard');
    }

    // update the order item field (optional)
    if (menu_text) {
      // make sure this function exists in models/orderModel.js (see next code block)
      await orderModel.updateOrderItem(orderId, menu_text);
    }

    // create a message record
    const createdMsg = await models.message.createMessage({
      orderId,
      senderType: 'client',
      senderId: clientId,
      message: menu_text || 'Client updated order',
      metadata: {},
    });

    // create persistent notification for admins (if notification model exists)
    let notification = null;
    if (
      models.notification &&
      typeof models.notification.createNotification === 'function'
    ) {
      try {
        notification = await models.notification.createNotification({
          order_id: orderId,
          type: 'menu_update',
          payload: {
            client_id: clientId,
            client_name: req.session.user.name || order.client_name,
            client_phone: req.session.user.phone || order.client_phone,
            order_summary: menu_text,
          },
        });
      } catch (notifErr) {
        console.error('Failed to create notification (non-fatal):', notifErr);
      }
    }

    // emit via socket.io
    const io = require('../utils/socket').get();
    if (io) {
      if (notification) io.to('admins').emit('new_notification', notification);
      io.to('admins').emit('order_message', { orderId, message: createdMsg });
      io.to(`order_${orderId}`).emit('new_message', createdMsg);
    }

    req.session.success = 'Your order updates were sent to our team.';
    return res.redirect('/client/dashboard');
  } catch (err) {
    console.error('postOrderMenu error', err);
    req.session.error = 'Could not add update to order';
    return res.redirect('/client/dashboard');
  }
};

// Book a vendor (updated: creates persistent admin notification + emits it)
exports.bookVendor = async (req, res) => {
  try {
    if (
      !req.session ||
      !req.session.user ||
      req.session.user.type !== 'client'
    ) {
      req.session.error = 'Please log in to place an order.';
      return res.redirect('/client/login');
    }

    const clientId = req.session.user.id;
    const { vendorId, item, payment_method } = req.body;

    const vendor = await vendorModel.findById(vendorId);
    if (!vendor) {
      req.session.error = 'Vendor not found.';
      return res.redirect('/client/dashboard');
    }
    const client = await clientModel.findById(clientId);
    if (!client) {
      req.session.error = 'Client not found.';
      return res.redirect('/client/dashboard');
    }

    const price = vendor.base_price || 0;

    const orderId = await orderModel.createOrder({
      clientId,
      vendorId,
      item: item || null,
      payment_method: payment_method || 'cod',
      total_amount: price,
    });

    // Persist the recent order id in session so client dashboard can auto-open the chat
    // (this survives external payment redirects as well)
    req.session.recent_order_id = orderId;

    const messageSummary = `Booking request: Client: ${client.full_name || ''} | Phone: ${client.phone || ''} | Address: ${client.address || ''} | Vendor: ${vendor ? vendor.name : ''} | Item: ${item || ''} | Payment: ${payment_method || 'cod'}`;
    const createdMsg = await models.message.createMessage({
      orderId,
      senderType: 'client',
      senderId: clientId,
      message: messageSummary,
      metadata: {},
    });

    const botPrompt = `Would you like to modify this request? Please select Yes or No.`;
    const botPromptMsg = await models.message.createMessage({
      orderId,
      senderType: 'bot',
      senderId: null,
      message: botPrompt,
      metadata: { vendorName: vendor ? vendor.name : null },
    });

    // persistent notification for admins (guarded; non-fatal)
    let notification = null;
    if (
      models.notification &&
      typeof models.notification.createNotification === 'function'
    ) {
      try {
        notification = await models.notification.createNotification({
          order_id: orderId,
          type: 'order',
          payload: {
            client_id: clientId,
            client_name: client.full_name,
            client_phone: client.phone,
            client_address: client.address,
            vendor_id: vendorId,
            vendor_name: vendor ? vendor.name : null,
            item: item || null,
            total_amount: price,
            created_at: new Date(),
          },
        });
      } catch (notifErr) {
        console.error('Failed to create notification (non-fatal):', notifErr);
        notification = null;
      }
    }

    const io = require('../utils/socket').get();
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
        created_at: new Date(),
      };

      // Emit the order summary and messages to admins & order room
      io.to('admins').emit('new_order', orderSummary);
      io.to('admins').emit('order_message', { orderId, message: createdMsg });
      io.to('admins').emit('order_message', { orderId, message: botPromptMsg });
      io.to(`order_${orderId}`).emit('new_message', createdMsg);
      io.to(`order_${orderId}`).emit('new_message', botPromptMsg);

      // Emit the persistent notification if it was created
      if (notification) {
        io.to('admins').emit('new_notification', notification);
      }
    }

    if (payment_method === 'paystack' || payment_method === 'flutterwave') {
      const payments = require('../utils/payments');

      try {
        if (payment_method === 'paystack') {
          const init = await payments.initPaystack(
            { email: client.email, amount: price },
            orderId
          );
          await orderModel.updatePaymentInit(
            orderId,
            'paystack',
            init.reference
          );
          return res.redirect(init.authorization_url);
        }

        if (payment_method === 'flutterwave') {
          const init = await payments.initFlutterwave(
            {
              amount: price,
              customer: {
                email: client.email,
                phonenumber: client.phone,
                name: client.full_name,
              },
            },
            orderId
          );
          await orderModel.updatePaymentInit(
            orderId,
            'flutterwave',
            init.tx_ref
          );
          return res.redirect(init.payment_link);
        }
      } catch (payErr) {
        console.error(
          'Payment init error:',
          payErr && payErr.message ? payErr.message : payErr
        );
        req.session.error =
          'Could not start online payment. Please try again or choose pay on delivery.';
        return res.redirect('/client/dashboard');
      }
    }

    req.session.success =
      'Booking request created. Check your dashboard for chat options to add a modification (if any).';
    return res.redirect('/client/dashboard');
  } catch (err) {
    console.error('Error creating booking:', err);
    req.session.error = 'Error creating booking';
    return res.redirect('/client/dashboard');
  }
};

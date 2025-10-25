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
const messageModel = models.message;
const notificationModel = models.notification;
const paymentsUtil = require('../utils/payments');
const walletModel =
  models && models.wallet ? models.wallet : require('../models/walletModel');
const paymentModel = models.payment;
const withdrawalModel = models.withdrawal;

const weeklyPlanModel =
  models.weeklyPlan || require('../models/weeklyPlanModel');
const weeklyPlanMessageModel =
  models.weeklyPlanMessages || require('../models/weeklyPlanMessageModel');

const avatarUtil = require('../utils/avatar');

const { sendMail } = require('../utils/mailer');
const { toLocal10, maskLocalId } = require('../utils/phone');

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

// Helpers for Lagos timezone handling
function nowLagos() {
  // Server might be in UTC. Nigeria is UTC+1 (no DST).
  const now = new Date();
  return new Date(now.getTime() + 1 * 60 * 60 * 1000);
}

function computeModWindowForWeek(weekOfDate) {
  // weekOfDate: Date (Monday)
  const weekOf = new Date(weekOfDate);
  // previous Friday: Monday - 3 days
  const prevFriday = new Date(weekOf);
  prevFriday.setDate(weekOf.getDate() - 3);
  prevFriday.setHours(0, 0, 0, 0);
  const prevSunday = new Date(prevFriday);
  prevSunday.setDate(prevFriday.getDate() + 2);
  prevSunday.setHours(23, 59, 59, 999);
  return { modFrom: prevFriday, modUntil: prevSunday };
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

    // Feature flag: turn email verification on/off via env var
    const verificationEnabled =
      String(process.env.ENABLE_EMAIL_VERIFICATION || 'false').toLowerCase() ===
      'true';

    if (!verificationEnabled) {
      // Mark user verified immediately for new signups
      try {
        await clientModel.setVerified(clientId);
      } catch (e) {
        console.warn('Failed to auto-mark client verified (non-fatal):', e);
      }
      req.session.success = 'Registration successful. You can now log in.';
      return res.redirect('/client/login');
    }

    // --- existing verification flow kept (runs only when verificationEnabled) ---
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
  // If verification is disabled, just inform and redirect
  const verificationEnabled =
    String(process.env.ENABLE_EMAIL_VERIFICATION || 'false').toLowerCase() ===
    'true';
  if (!verificationEnabled) {
    req.session.success =
      'Email verification is currently disabled. Your account is active.';
    return res.redirect('/client/login');
  }

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
  // If verification is disabled, nothing to resend
  const verificationEnabled =
    String(process.env.ENABLE_EMAIL_VERIFICATION || 'false').toLowerCase() ===
    'true';
  if (!verificationEnabled) {
    req.session.success =
      'Email verification is currently disabled. Your account is active.';
    return res.redirect('/client/login');
  }

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

/**
 * Client dashboard: show local vendors and client orders
 */
exports.dashboard = async (req, res) => {
  try {
    const clientId = req.session.user && req.session.user.id;
    if (!clientId) {
      req.session.error = 'Not authenticated';
      return res.redirect('/');
    }

    const client = await clientModel.findById(clientId);
    if (!client) {
      req.session.error = 'Client not found';
      return res.redirect('/');
    }

    // --- search filters (query string)
    const filters = {
      q: req.query.q ? String(req.query.q).trim() : null,
      state: req.query.state ? String(req.query.state).trim() : null,
      lga: req.query.lga ? String(req.query.lga).trim() : null,
    };

    const vendorFilter = {};
    if (filters.q) vendorFilter.q = filters.q;
    if (filters.state) vendorFilter.state = filters.state;
    if (filters.lga) vendorFilter.lga = filters.lga;

    if (!vendorFilter.q && !vendorFilter.state && !vendorFilter.lga) {
      vendorFilter.state = client.state;
      vendorFilter.lga = client.lga;
    }

    const vendors = await vendorModel.getApprovedVendors(vendorFilter);
    const orders = await orderModel.getOrdersByClient(clientId);

    // Pull recent IDs for UI focus (one-time)
    const recentOrderId = req.session.recent_order_id || null;
    if (req.session.recent_order_id) delete req.session.recent_order_id;

    const recentWeeklyPlanId = req.session.recent_weekly_plan_id || null;
    if (req.session.recent_weekly_plan_id)
      delete req.session.recent_weekly_plan_id;

    const recentWalletTxId = req.session.recent_wallet_tx_id || null;
    if (req.session.recent_wallet_tx_id) delete req.session.recent_wallet_tx_id;

    // weekly plans (non-fatal)
    let weeklyPlans = [];
    try {
      weeklyPlans = await weeklyPlanModel.getPlansByClient(clientId);
    } catch (e) {
      console.warn('Could not load weekly plans for dashboard', e);
    }

    // Normalize client's phone to local 10-digit (e.g. +2348065104250 -> 8065104250)
    const rawPhone =
      client.phone || client.phonenumber || client.msisdn || null;
    const local10 = toLocal10(rawPhone); // may be null if not parseable

    // Ensure wallet exists and attempt to set wallet_identifier if not present (won't overwrite locked)
    const w = await walletModel.createIfNotExists(
      clientId,
      local10 || null,
      true
    );

    // choose wallet id for display: prefer wallet_identifier (local phone), else wallet_uuid, else numeric id
    const walletRawId =
      w && w.wallet_identifier
        ? w.wallet_identifier
        : w && w.wallet_uuid
          ? w.wallet_uuid
          : w && w.id
            ? String(w.id)
            : null;

    const wallet = {
      id: walletRawId,
      displayId: w && w.wallet_identifier ? w.wallet_identifier : walletRawId,
      maskedDisplay: maskLocalId(
        w && w.wallet_identifier ? w.wallet_identifier : walletRawId || ''
      ),
      balance: Number(w && w.balance ? w.balance : 0),
      identifier_locked: !!(w && w.wallet_identifier_locked),
    };

    // compute displayName robustly from client record
    const displayName =
      client.name ||
      client.full_name ||
      (client.first_name && client.last_name
        ? `${client.first_name} ${client.last_name}`
        : null) ||
      client.email ||
      '';

    // --- NEW: ensure currentUser and statesLGAs are available to the template
    const currentUser =
      res.locals.currentUser ||
      client ||
      (req.session && req.session.user) ||
      {};
    let statesLGAs = [];
    try {
      if (typeof loadStatesLGAs === 'function') {
        statesLGAs = loadStatesLGAs();
      } else if (res.locals && Array.isArray(res.locals.statesLGAs)) {
        statesLGAs = res.locals.statesLGAs;
      }
    } catch (e) {
      console.warn('Could not load statesLGAs for dashboard', e);
      statesLGAs = [];
    }

    // --- NEW: load testimonials for dashboard and attach avatar urls
    let testimonials = [];
    try {
      const testimonialModel =
        models.testimonial || require('../models/testimonialModel');
      if (
        testimonialModel &&
        typeof testimonialModel.getApproved === 'function'
      ) {
        testimonials = await testimonialModel.getApproved(12);
        if (Array.isArray(testimonials) && testimonials.length) {
          testimonials = testimonials.map((t) =>
            Object.assign({}, t, {
              avatar: avatarUtil.avatarFor(t, 128),
            })
          );
        }
      }
    } catch (e) {
      console.warn('Could not load testimonials for dashboard', e);
      testimonials = [];
    }

    // --- IMPORTANT: include `request: req` inside the render data (and use the currentUser var)
    return res.render('client/dashboard', {
      title: 'Dashboard',
      layout: 'layouts/layout',
      user: client,
      currentUser: currentUser, // use the variable you defined above
      statesLGAs,
      displayName: displayName || '—',
      wallet,
      orders,
      weeklyPlans,
      vendors,
      filters,
      recentOrderId,
      recentWeeklyPlanId,
      recentWalletTxId,
      testimonials,
      request: req, // <- moved HERE (inside render object)
    });
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
      // make sure this function exists in models/orderModel.js
      await orderModel.updateOrderItem(orderId, menu_text);
    }

    // create a message record
    const createdMsg = await messageModel.createMessage({
      orderId,
      senderType: 'client',
      senderId: clientId,
      message: menu_text || 'Client updated order',
      metadata: {},
    });

    // create persistent notification for admins (if notification model exists)
    let notification = null;
    if (
      notificationModel &&
      typeof notificationModel.createNotification === 'function'
    ) {
      try {
        notification = await notificationModel.createNotification({
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

// Book a vendor (updated: supports wallet payments, creates persistent admin notification + emits it)
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
    const createdMsg = await messageModel.createMessage({
      orderId,
      senderType: 'client',
      senderId: clientId,
      message: messageSummary,
      metadata: {},
    });

    const botPrompt = `Would you like to modify this request? Please select Yes or No.`;
    const botPromptMsg = await messageModel.createMessage({
      orderId,
      senderType: 'bot',
      senderId: null,
      message: botPrompt,
      metadata: { vendorName: vendor ? vendor.name : null },
    });

    // persistent notification for admins (guarded; non-fatal)
    let notification = null;
    if (
      notificationModel &&
      typeof notificationModel.createNotification === 'function'
    ) {
      try {
        notification = await notificationModel.createNotification({
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

    // --- Wallet payment handling ---
    if (payment_method === 'wallet') {
      try {
        // attempt to debit atomically (returns { success, balance, txId } on success)
        const debitRes = await walletModel.debitIfEnough(clientId, price, {
          orderId,
          note: `Payment for order ${orderId}`,
        });

        if (!debitRes || !debitRes.success) {
          // insufficient funds: mark order (if you have such a helper) and redirect user to wallet
          if (
            orderModel &&
            typeof orderModel.updatePaymentStatus === 'function'
          ) {
            try {
              await orderModel.updatePaymentStatus(
                orderId,
                'insufficient_wallet'
              );
            } catch (e) {
              // non-fatal if method not implemented
            }
          }
          req.session.error =
            'Insufficient wallet balance. Please fund your wallet or choose another payment method.';
          return res.redirect('/client/dashboard#section-wallet');
        }

        // Record wallet payment for audit (optional)
        if (paymentModel && typeof paymentModel.createPayment === 'function') {
          try {
            await paymentModel.createPayment({
              orderId,
              provider: 'wallet',
              event: 'payment',
              providerReference: debitRes.txId || `wallet_tx_${Date.now()}`,
              amount: price,
              currency: 'NGN',
              status: 'success',
              raw: { tx: debitRes },
            });
          } catch (e) {
            console.warn(
              'Failed to persist wallet payment audit (non-fatal):',
              e
            );
          }
        }

        // mark order as paid by wallet
        if (orderModel && typeof orderModel.markPaid === 'function') {
          await orderModel.markPaid(
            orderId,
            'wallet',
            debitRes.txId || `wallet_tx_${Date.now()}`
          );
        }

        req.session.success = 'Booking created and paid from wallet.';
        return res.redirect('/client/dashboard#section-orders');
      } catch (walletErr) {
        console.error('Wallet payment error:', walletErr);
        req.session.error =
          'Could not complete wallet payment. Please try again.';
        return res.redirect('/client/dashboard');
      }
    }

    // --- External payment flows (paystack / flutterwave) ---
    if (payment_method === 'paystack' || payment_method === 'flutterwave') {
      try {
        if (payment_method === 'paystack') {
          const init = await paymentsUtil.initPaystack(
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
          const init = await paymentsUtil.initFlutterwave(
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

    // Default: booking created (e.g. COD)
    req.session.success =
      'Booking request created. Check your dashboard for chat options to add a modification (if any).';
    return res.redirect('/client/dashboard');
  } catch (err) {
    console.error('Error creating booking:', err);
    req.session.error = 'Error creating booking';
    return res.redirect('/client/dashboard');
  }
};

/* -------------------------------------------
   WEEKLY PLAN: client-facing handlers
   These functions integrate with weeklyPlanModel
   and weeklyPlanMessageModel.
   ------------------------------------------- */

exports.showSpecialOrderForm = async (req, res) => {
  try {
    if (
      !req.session ||
      !req.session.user ||
      req.session.user.type !== 'client'
    ) {
      req.session.error = 'Please log in to place a weekly plan';
      return res.redirect('/client/login');
    }

    const clientId = req.session.user.id;
    const client = await clientModel.findById(clientId);
    const vendors = await vendorModel.getApprovedVendors({
      state: client?.state,
      lga: client?.lga,
    });

    // compute next Monday as default week_of (Lagos timezone)
    const now = nowLagos();
    const todayDow = now.getDay();
    const daysToNextMonday = (8 - todayDow) % 7 || 7;
    const nextMonday = new Date(now);
    nextMonday.setDate(now.getDate() + daysToNextMonday);
    nextMonday.setHours(0, 0, 0, 0);

    return res.render('client/special-order', {
      vendors,
      defaultWeekOf: nextMonday.toISOString().slice(0, 10),
      pageScripts: ['/js/special-order.js'],
    });
  } catch (e) {
    console.error('showSpecialOrderForm error', e);
    req.session.error = 'Could not open special order form';
    return res.redirect('/client/dashboard');
  }
};

exports.postSpecialOrder = async (req, res) => {
  try {
    if (
      !req.session ||
      !req.session.user ||
      req.session.user.type !== 'client'
    ) {
      req.session.error = 'Please log in to place a weekly plan';
      return res.redirect('/client/login');
    }
    const clientId = req.session.user.id;
    const planType = String(req.body.plan_type || 'single');
    const weekOf = String(req.body.week_of || '');
    const vendorId = req.body.vendorId || null;
    const paymentMethod = req.body.payment_method || 'cod';

    // parse items JSON (client sends a JSON string in hidden field 'items')
    let items = [];
    if (req.body.items) {
      try {
        items = JSON.parse(req.body.items);
      } catch (e) {
        items = [];
      }
      if (!items || !items.length) {
        const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
        for (const d of days) {
          if (planType === 'single') {
            const k = req.body[`${d}_1`];
            if (k)
              items.push({
                day_of_week: d,
                slot: 1,
                food_key: k,
                food_label: k,
              });
          } else {
            const k1 = req.body[`${d}_1`];
            const k2 = req.body[`${d}_2`];
            if (k1)
              items.push({
                day_of_week: d,
                slot: 1,
                food_key: k1,
                food_label: k1,
              });
            if (k2)
              items.push({
                day_of_week: d,
                slot: 2,
                food_key: k2,
                food_label: k2,
              });
          }
        }
      }
    } else {
      const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
      for (const d of days) {
        if (planType === 'single') {
          const k = req.body[`${d}_1`];
          if (k)
            items.push({
              day_of_week: d,
              slot: 1,
              food_key: k,
              food_label: k,
            });
        } else {
          const k1 = req.body[`${d}_1`];
          const k2 = req.body[`${d}_2`];
          if (k1)
            items.push({
              day_of_week: d,
              slot: 1,
              food_key: k1,
              food_label: k1,
            });
          if (k2)
            items.push({
              day_of_week: d,
              slot: 2,
              food_key: k2,
              food_label: k2,
            });
        }
      }
    }

    const PRICES = {
      single: Number(process.env.WEEKLY_SINGLE_PRICE || 30000),
      double: Number(process.env.WEEKLY_DOUBLE_PRICE || 55000),
    };
    const totalPrice = PRICES[planType] || PRICES.single;
    const weekDate = new Date(weekOf + 'T00:00:00Z');
    const { modFrom, modUntil } = computeModWindowForWeek(weekDate);

    const created = await weeklyPlanModel.createWeeklyPlan({
      clientId,
      vendorId,
      weekOf,
      planType,
      totalPrice,
      paymentMethod,
      modifiableFrom: modFrom,
      modifiableUntil: modUntil,
      items,
    });

    // Persist recent weekly plan id so dashboard can auto-open weekly plans view
    req.session.recent_weekly_plan_id = created.id;

    // create persistent notification if available
    try {
      if (
        notificationModel &&
        typeof notificationModel.createNotification === 'function'
      ) {
        await notificationModel.createNotification({
          order_id: null,
          type: 'weekly_plan',
          payload: {
            weekly_plan_id: created.id,
            client_id: clientId,
            client_name: req.session.user.name || null,
            client_phone: req.session.user.phone || null,
            client_address: req.session.user.address || null,
            week_of: weekOf,
            plan_type: planType,
            total_price: totalPrice,
            created_at: new Date(),
          },
        });
      }
    } catch (e) {
      console.warn('notif create failed', e);
    }

    // Emit via socket to admins
    try {
      const io = require('../utils/socket').get();
      if (io) {
        const payload = {
          id: created.id,
          client_id: clientId,
          client_name: req.session.user.name || null,
          client_phone: req.session.user.phone || null,
          client_address: req.session.user.address || null,
          week_of: weekOf,
          plan_type: planType,
          total_price: totalPrice,
          created_at: new Date(),
        };
        io.to('admins').emit('new_weekly_plan', payload);
      }
    } catch (e) {
      console.warn('socket emit failed', e);
    }

    // --- WALLET payment handling for weekly plans (NEW) ---
    if (paymentMethod === 'wallet') {
      try {
        // attempt to debit atomically (returns { success, balance, txId } on success)
        const debitRes = await walletModel.debitIfEnough(clientId, totalPrice, {
          weeklyPlanId: created.id,
          note: `Payment for weekly plan ${created.id}`,
        });

        if (!debitRes || !debitRes.success) {
          // Optional: mark plan payment state for bookkeeping
          if (
            weeklyPlanModel &&
            typeof weeklyPlanModel.setPaymentStatus === 'function'
          ) {
            try {
              await weeklyPlanModel.setPaymentStatus(
                created.id,
                'insufficient_wallet'
              );
            } catch (e) {
              // non-fatal
            }
          }
          req.session.error =
            'Insufficient wallet balance. Please fund your wallet or choose another payment method.';
          return res.redirect('/client/dashboard#section-wallet');
        }

        // Record wallet payment for audit (if paymentModel exists)
        if (paymentModel && typeof paymentModel.createPayment === 'function') {
          try {
            await paymentModel.createPayment({
              weeklyPlanId: created.id,
              provider: 'wallet',
              event: 'payment',
              providerReference: debitRes.txId || `wallet_tx_${Date.now()}`,
              amount: totalPrice,
              currency: 'NGN',
              status: 'success',
              raw: { tx: debitRes },
            });
          } catch (e) {
            console.warn(
              'Failed to persist wallet payment audit (non-fatal):',
              e
            );
          }
        }

        // mark weekly plan as paid (best-effort; try setPaymentStatus then fallback)
        try {
          if (
            weeklyPlanModel &&
            typeof weeklyPlanModel.markPaid === 'function'
          ) {
            await weeklyPlanModel.markPaid(
              created.id,
              'wallet',
              debitRes.txId || `wallet_tx_${Date.now()}`
            );
          } else if (
            weeklyPlanModel &&
            typeof weeklyPlanModel.setPaymentStatus === 'function'
          ) {
            await weeklyPlanModel.setPaymentStatus(created.id, 'paid');
          } else {
            // If no helper exists, update the DB directly if you have a method
            console.warn(
              'No weeklyPlanModel.markPaid / setPaymentStatus found; payment recorded but plan may not be marked paid in DB.'
            );
          }
        } catch (e) {
          console.warn('Failed to mark weekly plan paid (non-fatal):', e);
        }

        req.session.success = 'Weekly plan created and paid from wallet.';
        return res.redirect('/client/dashboard#section-weekly');
      } catch (walletErr) {
        console.error('Wallet payment error (weekly plan):', walletErr);
        req.session.error =
          'Could not complete wallet payment. Please try again.';
        return res.redirect('/client/dashboard');
      }
    }

    // --- External payment flows (paystack / flutterwave) ---
    if (paymentMethod === 'paystack' || paymentMethod === 'flutterwave') {
      try {
        const client = await clientModel.findById(clientId);
        if (paymentMethod === 'paystack') {
          const init = await paymentsUtil.initPaystack(
            { email: client.email, amount: totalPrice },
            created.id
          );
          await weeklyPlanModel.setPaymentStatus(created.id, 'pending');
          return res.redirect(init.authorization_url);
        }
        if (paymentMethod === 'flutterwave') {
          const init = await paymentsUtil.initFlutterwave(
            {
              amount: totalPrice,
              customer: {
                email: client.email,
                phonenumber: client.phone,
                name: client.full_name,
              },
            },
            created.id
          );
          await weeklyPlanModel.setPaymentStatus(created.id, 'pending');
          return res.redirect(init.payment_link);
        }
      } catch (payErr) {
        console.error('Payment init error', payErr);
        req.session.error =
          'Could not start online payment. Please try again or choose pay on delivery.';
        return res.redirect('/client/dashboard');
      }
    }

    // Default: booking created (e.g. COD)
    req.session.success =
      'Weekly plan created. Our Food Order Specialist will review it.';
    return res.redirect('/client/dashboard');
  } catch (err) {
    console.error(
      'postSpecialOrder error',
      err && err.detail ? err.detail : err
    );
    req.session.error = 'Could not create weekly plan';
    return res.redirect('/client/dashboard');
  }
};

exports.updateSpecialOrder = async (req, res) => {
  try {
    if (
      !req.session ||
      !req.session.user ||
      req.session.user.type !== 'client'
    ) {
      req.session.error = 'Please log in';
      return res.redirect('/client/login');
    }
    const clientId = req.session.user.id;
    const planId = req.params.id;
    const plan = await weeklyPlanModel.getPlanWithItems(planId);
    if (!plan) {
      req.session.error = 'Plan not found';
      return res.redirect('/client/dashboard');
    }
    if (String(plan.client_id) !== String(clientId)) {
      req.session.error = 'Not authorized';
      return res.redirect('/client/dashboard');
    }

    const now = nowLagos();
    const modFrom = new Date(plan.modifiable_from);
    const modUntil = new Date(plan.modifiable_until);
    if (!(now >= modFrom && now <= modUntil)) {
      req.session.error =
        'This plan is not modifiable at this time. Modifications allowed Friday 00:00 - Sunday 23:59 Lagos time.';
      return res.redirect('/client/dashboard');
    }

    // robust items parsing: try JSON hidden field first, fallback to per-day fields
    let items = [];
    if (req.body.items) {
      try {
        items = JSON.parse(req.body.items);
      } catch (e) {
        items = [];
      }
      // If parsed items is empty, fallback to discrete fields
      if (!items || !items.length) {
        const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
        for (const d of days) {
          if (plan.plan_type === 'single') {
            const k = req.body[`${d}_1`];
            if (k)
              items.push({
                day_of_week: d,
                slot: 1,
                food_key: k,
                food_label: k,
              });
          } else {
            const k1 = req.body[`${d}_1`];
            const k2 = req.body[`${d}_2`];
            if (k1)
              items.push({
                day_of_week: d,
                slot: 1,
                food_key: k1,
                food_label: k1,
              });
            if (k2)
              items.push({
                day_of_week: d,
                slot: 2,
                food_key: k2,
                food_label: k2,
              });
          }
        }
      }
    } else {
      const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
      for (const d of days) {
        if (plan.plan_type === 'single') {
          const k = req.body[`${d}_1`];
          if (k)
            items.push({
              day_of_week: d,
              slot: 1,
              food_key: k,
              food_label: k,
            });
        } else {
          const k1 = req.body[`${d}_1`];
          const k2 = req.body[`${d}_2`];
          if (k1)
            items.push({
              day_of_week: d,
              slot: 1,
              food_key: k1,
              food_label: k1,
            });
          if (k2)
            items.push({
              day_of_week: d,
              slot: 2,
              food_key: k2,
              food_label: k2,
            });
        }
      }
    }

    await weeklyPlanModel.updatePlanItems(planId, items);

    // notification + socket emit to admins
    try {
      if (
        notificationModel &&
        typeof notificationModel.createNotification === 'function'
      ) {
        await notificationModel.createNotification({
          order_id: null,
          type: 'weekly_plan_update',
          payload: {
            weekly_plan_id: planId,
            client_id: clientId,
            client_name: req.session.user.name || null,
            updated_at: new Date(),
          },
        });
      }
    } catch (notifErr) {
      console.warn('notif create error', notifErr);
    }

    try {
      const io = require('../utils/socket').get();
      if (io) {
        io.to('admins').emit('weekly_plan_updated', {
          plan_id: planId,
          client_id: clientId,
        });
      }
    } catch (e) {
      /* ignore */
    }

    req.session.success = 'Plan updated and sent to our team';
    return res.redirect('/client/dashboard');
  } catch (err) {
    console.error('updateSpecialOrder error', err);
    req.session.error = 'Could not update plan';
    return res.redirect('/client/dashboard');
  }
};

// small helpers for client controller listing/viewing
exports.listWeeklyPlans = async (req, res) => {
  try {
    if (
      !req.session ||
      !req.session.user ||
      req.session.user.type !== 'client'
    ) {
      req.session.error = 'Please log in';
      return res.redirect('/client/login');
    }
    const clientId = req.session.user.id;
    const plans = await weeklyPlanModel.getPlansByClient(clientId);
    return res.render('client/dashboard', {
      weeklyPlans: plans,
      orders: req.orders || [],
      vendors: req.vendors || [],
    });
  } catch (e) {
    console.error('listWeeklyPlans error', e);
    req.session.error = 'Could not list plans';
    return res.redirect('/client/dashboard');
  }
};

exports.viewWeeklyPlan = async (req, res) => {
  try {
    if (
      !req.session ||
      !req.session.user ||
      req.session.user.type !== 'client'
    ) {
      req.session.error = 'Please log in';
      return res.redirect('/client/login');
    }
    const planId = req.params.id;
    const plan = await weeklyPlanModel.getPlanWithItems(planId);
    if (!plan) {
      req.session.error = 'Plan not found';
      return res.redirect('/client/dashboard');
    }
    if (String(plan.client_id) !== String(req.session.user.id)) {
      req.session.error = 'Not authorized';
      return res.redirect('/client/dashboard');
    }
    const messages = await weeklyPlanMessageModel.getMessagesByPlan(
      planId,
      500
    );
    return res.render('client/special-order-view', { plan, messages });
  } catch (e) {
    console.error('viewWeeklyPlan error', e);
    req.session.error = 'Could not view plan';
    return res.redirect('/client/dashboard');
  }
};

/* --------------------------
   Manage account forms & updates
   (Show form pages and handle POSTs)
   -------------------------- */

// Show account menu (keeps your existing behavior)
exports.showAccountMenu = (req, res) => {
  // res.locals.currentUser already set by auth middleware (if present)
  return res.render('client/account-menu', {
    currentUser:
      res.locals.currentUser || (req.session && req.session.user) || {},
  });
};

// Render phone edit form (uses res.locals.currentUser for JWT flow)
exports.showPhoneForm = (req, res) => {
  return res.render('client/account-phone', {
    currentUser:
      res.locals.currentUser || (req.session && req.session.user) || {},
  });
};

// Render address edit form (exposes statesLGAs for the location picker)
exports.showAddressForm = (req, res) => {
  return res.render('client/account-address', {
    currentUser:
      res.locals.currentUser || (req.session && req.session.user) || {},
    statesLGAs: loadStatesLGAs(),
  });
};

// Render change-password form
exports.showPasswordForm = (req, res) => {
  return res.render('client/account-password', {
    currentUser:
      res.locals.currentUser || (req.session && req.session.user) || {},
  });
};

/**
 * AJAX: Update phone
 * - Uses clientModel.updatePhone(clientId, newPhone) if available
 * - Falls back to clientModel.updateClient(clientId, { phone: newPhone })
 * - Does NOT change wallet identifier.
 */
exports.updatePhone = async (req, res) => {
  try {
    const clientId =
      (req.user && req.user.id) ||
      (req.session && req.session.user && req.session.user.id);
    if (!clientId) {
      if (req.xhr || req.headers.accept.indexOf('json') > -1) {
        return res
          .status(401)
          .json({ success: false, error: 'Not authenticated' });
      }
      req.session.error = 'Not authenticated';
      return res.redirect('/login');
    }

    const newPhone = String((req.body && req.body.phone) || '').trim();
    if (!newPhone || newPhone.length < 6) {
      if (req.xhr || req.headers.accept.indexOf('json') > -1) {
        return res.status(400).json({
          success: false,
          error: 'Please provide a valid phone number.',
        });
      }
      req.session.error = 'Please provide a valid phone number.';
      return res.redirect('/client/account/phone');
    }

    // Use model helpers if present, else fall back
    let updated;
    if (typeof clientModel.updatePhone === 'function') {
      updated = await clientModel.updatePhone(clientId, newPhone);
    } else if (typeof clientModel.updateClient === 'function') {
      await clientModel.updateClient(clientId, { phone: newPhone });
      updated = await clientModel.findById(clientId);
    } else {
      if (req.xhr || req.headers.accept.indexOf('json') > -1) {
        return res.status(500).json({
          success: false,
          error: 'Server not configured to update phone',
        });
      }
      req.session.error = 'Server not configured to update phone';
      return res.redirect('/client/account/phone');
    }

    // Sync session user display phone if present
    if (req.session && req.session.user)
      req.session.user.phone =
        updated && updated.phone ? updated.phone : newPhone;

    // Return JSON for AJAX; otherwise redirect back to dashboard with flash
    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
      return res.json({
        success: true,
        message: 'Phone updated',
        phone: updated.phone || newPhone,
      });
    }

    req.session.success = 'Phone updated (wallet ID unchanged).';
    return res.redirect('/client/dashboard#section-account');
  } catch (err) {
    console.error('updatePhone error', err);
    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
      return res.status(500).json({ success: false, error: 'Server error' });
    }
    req.session.error = 'Could not update phone.';
    return res.redirect('/client/dashboard#section-account');
  }
};

//updateAddress
exports.updateAddress = async (req, res) => {
  try {
    const clientId =
      (req.user && req.user.id) ||
      (req.session && req.session.user && req.session.user.id);
    if (!clientId)
      return res
        .status(401)
        .json({ success: false, error: 'Not authenticated' });

    const address = String((req.body && req.body.address) || '').trim();
    const state =
      req.body && req.body.state ? String(req.body.state).trim() : null;
    const lga = req.body && req.body.lga ? String(req.body.lga).trim() : null;

    if (!address) {
      return res
        .status(400)
        .json({ success: false, error: 'Address cannot be empty.' });
    }

    let updated = null;

    // Use updateAddress for plain address string (avoid passing an object here)
    if (typeof clientModel.updateAddress === 'function') {
      updated = await clientModel.updateAddress(clientId, address); // <-- pass string
      // If you also need to update state/lga, call updateClient (if available)
      if ((state || lga) && typeof clientModel.updateClient === 'function') {
        await clientModel.updateClient(clientId, { state, lga });
        // refresh updated record
        updated = await clientModel.findById(clientId);
      }
    } else if (typeof clientModel.updateClient === 'function') {
      // If model only supports updateClient, use it with an object
      await clientModel.updateClient(clientId, { address, state, lga });
      updated = await clientModel.findById(clientId);
    } else {
      return res.status(500).json({
        success: false,
        error: 'Server not configured to update address',
      });
    }

    // normalize returned address to string
    const returnedAddress =
      updated && updated.address
        ? typeof updated.address === 'string'
          ? updated.address
          : updated.address.address || ''
        : address;

    if (req.session && req.session.user) {
      req.session.user.address = returnedAddress;
      if (state) req.session.user.state = (updated && updated.state) || state;
      if (lga) req.session.user.lga = (updated && updated.lga) || lga;
    }

    return res.json({
      success: true,
      message: 'Address updated',
      address: returnedAddress,
      state: (updated && updated.state) || state,
      lga: (updated && updated.lga) || lga,
    });
  } catch (err) {
    console.error('updateAddress error', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
};

/**
 * AJAX: Update password
 *
 * Expects current_password, new_password, confirm_password in body.
 * - Validates presence, match, and minimal length.
 * - Verifies current password against either client.password or client.password_hash.
 * - Uses clientModel.updatePassword(clientId, hash) or clientModel.updateClient(clientId, { password_hash: hash }) as fallback.
 */
exports.updatePassword = async (req, res) => {
  try {
    const clientId =
      (req.user && req.user.id) ||
      (req.session && req.session.user && req.session.user.id);
    if (!clientId)
      return res
        .status(401)
        .json({ success: false, error: 'Not authenticated' });

    const { current_password, new_password, confirm_password } = req.body || {};

    if (!current_password || !new_password || !confirm_password) {
      return res
        .status(400)
        .json({ success: false, error: 'All password fields are required.' });
    }
    if (new_password !== confirm_password) {
      return res
        .status(400)
        .json({ success: false, error: 'New passwords do not match.' });
    }
    // enforce minimal strength policy server-side
    if (String(new_password).length < 8) {
      return res.status(400).json({
        success: false,
        error: 'New password must be at least 8 characters.',
      });
    }

    const user = await clientModel.findById(clientId);
    if (!user)
      return res.status(404).json({ success: false, error: 'User not found' });

    // determine what field holds the hashed password
    const passwordHashField = user.password || user.password_hash || null;
    if (passwordHashField) {
      const match = await bcrypt.compare(current_password, passwordHashField);
      if (!match) {
        return res
          .status(400)
          .json({ success: false, error: 'Current password is incorrect.' });
      }
    } else {
      // no existing password; allow setting new password without checking current_password
      // (you may want to require verification if account created via social/otp)
    }

    const hash = await bcrypt.hash(new_password, SALT_ROUNDS);

    if (typeof clientModel.updatePassword === 'function') {
      await clientModel.updatePassword(clientId, hash);
    } else if (typeof clientModel.updateClient === 'function') {
      // try to set password_hash or password depending on model shape
      if ('password_hash' in user) {
        await clientModel.updateClient(clientId, { password_hash: hash });
      } else {
        await clientModel.updateClient(clientId, { password: hash });
      }
    } else {
      return res.status(500).json({
        success: false,
        error: 'Server not configured to update password',
      });
    }

    return res.json({
      success: true,
      message:
        'Password updated. Please use the new password next time you log in.',
    });
  } catch (err) {
    console.error('updatePassword error', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
};

// Show wallet UI (balance)
exports.showWallet = async (req, res) => {
  if (!req.session || !req.session.user || req.session.user.type !== 'client') {
    req.session.error = 'Please log in';
    return res.redirect('/client/login');
  }
  try {
    const clientId = req.session.user.id;
    const balance = await walletModel.getBalance(clientId);
    return res.render('client/wallet', { balance });
  } catch (err) {
    console.error('showWallet error', err);
    req.session.error = 'Could not load wallet';
    return res.redirect('/client/dashboard');
  }
};

// Post: initiate wallet funding (redirects to provider)
exports.postFundWallet = async (req, res) => {
  if (!req.session || !req.session.user || req.session.user.type !== 'client') {
    req.session.error = 'Please log in';
    return res.redirect('/client/login');
  }

  const clientId = req.session.user.id;
  const amount = Number(req.body.amount);
  const provider = String(req.body.provider || '').toLowerCase();

  if (!amount || amount <= 0) {
    req.session.error = 'Invalid amount';
    return res.redirect('/client/dashboard#section-wallet');
  }

  try {
    // create an init payment record for audit (optional)
    // Use metadata so provider returns clientId & wallet_topup flag
    const metadata = { wallet_topup: true, clientId };

    if (provider === 'paystack') {
      const init = await require('../utils/payments').initPaystack(
        { email: req.session.user.email, amount, metadata },
        null
      );
      // store initial payment (init) for traceability
      await paymentModel.createPayment({
        orderId: null,
        provider: 'paystack',
        event: 'init',
        providerReference: init.reference,
        amount,
        currency: 'NGN',
        status: 'init',
        raw: init.raw,
      });

      // redirect user to paystack
      return res.redirect(init.authorization_url);
    }

    if (provider === 'flutterwave') {
      const init = await require('../utils/payments').initFlutterwave(
        {
          amount,
          currency: 'NGN',
          customer: {
            email: req.session.user.email,
            phonenumber: req.session.user.phone,
            name: req.session.user.name,
          },
          // pass meta
          meta: metadata,
        },
        null
      );

      await paymentModel.createPayment({
        orderId: null,
        provider: 'flutterwave',
        event: 'init',
        providerReference: init.tx_ref,
        amount,
        currency: 'NGN',
        status: 'init',
        raw: init.raw,
      });

      return res.redirect(init.payment_link);
    }

    req.session.error = 'Unknown provider';
    return res.redirect('/client/dashboard#section-wallet');
  } catch (err) {
    console.error('postFundWallet error', err);
    req.session.error = 'Could not start funding. Try again later.';
    return res.redirect('/client/dashboard#section-wallet');
  }
};

// postWithdrawalRequest
exports.postWithdrawalRequest = async (req, res) => {
  if (!req.session || !req.session.user || req.session.user.type !== 'client') {
    req.session.error = 'Please log in';
    return res.redirect('/client/login');
  }

  try {
    const clientId = req.session.user.id;
    const amount = Number(req.body.amount);
    const method = req.body.method || 'bank';

    // Parse destination: accept JSON string or object fields
    let destination = {};
    if (req.body.destination) {
      try {
        destination =
          typeof req.body.destination === 'string'
            ? JSON.parse(req.body.destination)
            : req.body.destination;
      } catch (e) {
        destination = req.body.destination_obj || {};
      }
    } else {
      destination = req.body.destination_obj || {};
    }

    if (!amount || amount <= 0) {
      req.session.error = 'Invalid amount';
      return res.redirect('/client/dashboard#section-wallet');
    }

    // Minimum / KYC / limits configuration (env-vars with fallbacks)
    const MIN_WITHDRAWAL = Number(process.env.MIN_WITHDRAWAL_AMOUNT || 500); // NGN
    const DAILY_LIMIT = Number(process.env.DAILY_WITHDRAWAL_LIMIT || 200000); // NGN

    if (amount < MIN_WITHDRAWAL) {
      req.session.error = `Minimum withdrawal is ₦${MIN_WITHDRAWAL.toLocaleString()}`;
      return res.redirect('/client/dashboard#section-wallet');
    }

    // Load client for KYC & other checks
    const client = await clientModel.findById(clientId);
    if (!client) {
      req.session.error = 'Client not found';
      return res.redirect('/client/dashboard#section-wallet');
    }

    // KYC check — adapt to your client schema (try common field names)
    const kycVerified =
      client.kyc_verified === true ||
      String(client.kyc_status || '').toLowerCase() === 'verified' ||
      client.is_kyc_verified === true;

    // If above threshold and not KYC verified -> reject
    const KYC_THRESHOLD = Number(process.env.KYC_THRESHOLD || 50000); // require KYC for withdrawals > this
    if (amount > KYC_THRESHOLD && !kycVerified) {
      req.session.error =
        'Withdrawals above ₦' +
        KYC_THRESHOLD.toLocaleString() +
        ' require KYC verification. Please complete KYC first.';
      return res.redirect('/client/dashboard#section-wallet');
    }

    // Check daily withdrawals (sum of today's amounts). Uses withdrawalModel.sumClientWithdrawals
    const sinceToday = new Date();
    sinceToday.setHours(0, 0, 0, 0);
    let dailyTotal = 0;
    try {
      dailyTotal = await withdrawalModel.sumClientWithdrawals(clientId, {
        since: sinceToday,
      });
    } catch (e) {
      // if that helper not present, fall back to 0
      dailyTotal = 0;
    }

    if (dailyTotal + amount > DAILY_LIMIT) {
      req.session.error = `Daily withdrawal limit exceeded (₦${DAILY_LIMIT.toLocaleString()}). You have already requested ₦${Number(dailyTotal).toLocaleString()}.`;
      return res.redirect('/client/dashboard#section-wallet');
    }

    // Optional: check wallet balance first (friendly UX). Keep actual debit on admin approval.
    const balance = await walletModel.getBalance(clientId);
    if (balance < amount) {
      req.session.error = 'Insufficient wallet balance';
      return res.redirect('/client/dashboard#section-wallet');
    }

    // Create request (model handles insertion)
    const created = await withdrawalModel.createRequest({
      clientId,
      amount,
      method,
      destination,
    });

    // notify admins via socket (real-time) with a friendly payload
    const io = require('../utils/socket').get();
    if (io) {
      io.to('admins').emit('new_withdrawal', {
        id: created.id,
        client_id: created.client_id,
        client_name: client.full_name || req.session.user.full_name || null,
        client_email: client.email || req.session.user.email || null,
        client_phone: client.phone || req.session.user.phone || null,
        amount: created.amount,
        destination: created.destination,
        created_at: created.created_at,
        note: created.admin_note || null,
      });
    }

    // persistent notification (best-effort)
    if (
      notificationModel &&
      typeof notificationModel.createNotification === 'function'
    ) {
      try {
        await notificationModel.createNotification({
          order_id: null,
          type: 'withdrawal_request',
          payload: {
            withdrawal_id: created.id,
            client_id: clientId,
            amount: created.amount,
            created_at: created.created_at,
          },
        });
      } catch (e) {
        console.warn('Could not create withdrawal notification', e);
      }
    }

    req.session.success = 'Withdrawal request submitted. Admin will review.';
    return res.redirect('/client/dashboard#section-wallet');
  } catch (err) {
    console.error('postWithdrawalRequest error', err);
    req.session.error = err.message || 'Could not submit withdrawal request';
    return res.redirect('/client/dashboard#section-wallet');
  }
};

// Client: list own requests (optional route)
exports.listMyWithdrawals = async (req, res) => {
  if (!req.session || !req.session.user || req.session.user.type !== 'client') {
    req.session.error = 'Please log in';
    return res.redirect('/client/login');
  }
  try {
    const clientId = req.session.user.id;
    const rows = await withdrawalModel.getRequestsByClient(clientId);
    return res.render('client/wallet-requests', { requests: rows });
  } catch (e) {
    req.session.error = 'Could not load withdrawal requests';
    return res.redirect('/client/dashboard#section-wallet');
  }
};

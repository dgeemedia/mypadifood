// controllers/adminController.js
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const { v4: uuidv4 } = require('uuid');
const adminResetModel = require('../models').adminReset;

const models = require('../models'); // { client, vendor, admin, order, verification, message, ... }
const adminModel = models.admin;
const vendorModel = models.vendor;
const riderModel = models.rider;
const orderModel = models.order;
const messageModel = models.message;
const notificationModel = models.notification || null;

// weekly plan models (prefer models/index exports but fall back to direct require)
const weeklyPlanModel =
  models.weeklyPlan || require('../models/weeklyPlanModel');
const weeklyPlanMessageModel =
  models.weeklyPlanMessages || require('../models/weeklyPlanMessageModel');

const socketUtil = require('../utils/socket'); // for emitting socket events
const { sendMail } = require('../utils/mailer'); // email helper

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

// Render admin login page
exports.showLogin = (req, res) => {
  return res.render('admin/login', { userType: 'admin' });
};

// Render create-admin form (protected by route middleware)
exports.showCreateForm = (req, res) => {
  const statesLGAs = loadStatesLGAs();
  return res.render('admin/create', { statesLGAs });
};

// Handle admin login
exports.login = async (req, res) => {
  const { email, password } = req.body;
  try {
    const admin = await adminModel.findByEmail(email);
    if (!admin) {
      req.session.error = 'Invalid credentials';
      return res.redirect('/admin/login');
    }

    const ok = await bcrypt.compare(password, admin.password_hash);
    if (!ok) {
      req.session.error = 'Invalid credentials';
      return res.redirect('/admin/login');
    }

    req.session.user = {
      id: admin.id,
      type: admin.role === 'super' ? 'super' : 'admin',
      name: admin.name,
      email: admin.email,
    };

    req.session.success = `Welcome admin ${admin.name}`;
    return res.redirect('/admin/dashboard');
  } catch (err) {
    console.error('Admin login error:', err);
    req.session.error = 'Admin login failed';
    return res.redirect('/admin/login');
  }
};

// Logout admin
exports.logout = (req, res) => {
  req.session.destroy((err) => {
    if (err) console.error('Admin logout error:', err);
    res.clearCookie('connect.sid');
    return res.redirect('/');
  });
};

// Show forgot-password form
exports.showForgot = (req, res) => {
  return res.render('admin/forgot');
};

// Handle forgot-password POST: create a token and email reset link (non-enumerating)
exports.forgot = async (req, res) => {
  try {
    const email =
      req.body && req.body.email ? String(req.body.email).trim() : null;
    const baseUrl =
      process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

    // Always show the same response to avoid revealing whether account exists
    const genericMsg =
      'If an account exists for that email, a password reset link was sent. Check your inbox.';

    if (!email) {
      req.session.success = genericMsg;
      return res.redirect('/admin/login');
    }

    const admin = await adminModel.findByEmail(email);
    if (!admin) {
      // Still provide the generic message
      req.session.success = genericMsg;
      return res.redirect('/admin/login');
    }

    // Remove any old tokens for this admin (optional cleanup)
    try {
      await adminResetModel.deleteTokensForAdmin(admin.id);
    } catch (e) {
      /* non-fatal */
    }

    const token = uuidv4();
    const ttlHours = Number(process.env.ADMIN_RESET_TTL_HOURS || 2); // 2 hours default
    const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000);

    await adminResetModel.createToken(token, admin.id, expiresAt, {
      ip: req.ip || null,
    });

    const resetLink = `${baseUrl}/admin/reset?token=${encodeURIComponent(token)}`;

    const subject = 'MyPadiFood admin password reset';
    const html = `<p>Hi ${admin.name || 'Admin'},</p>
      <p>We received a request to reset your admin account password. If you requested this, click the link below to set a new password (link expires in ${ttlHours} hours):</p>
      <p><a href="${resetLink}">${resetLink}</a></p>
      <p>If you did not request this, you can safely ignore this email.</p>`;
    const text = `Reset your password: ${resetLink}`;

    try {
      await sendMail({ to: admin.email, subject, html, text });
    } catch (mailErr) {
      console.error('Failed to send admin reset email (non-fatal):', mailErr);
    }

    req.session.success = genericMsg;
    return res.redirect('/admin/login');
  } catch (err) {
    console.error('Error in admin.forgot:', err);
    req.session.error = 'Could not process password reset request.';
    return res.redirect('/admin/login');
  }
};

// GET /admin/reset?token=...
exports.showReset = async (req, res) => {
  try {
    const token = req.query.token ? String(req.query.token) : null;
    if (!token) {
      req.session.error = 'Invalid reset link.';
      return res.redirect('/admin/login');
    }

    const row = await adminResetModel.findToken(token);
    if (!row) {
      req.session.error = 'Invalid or expired reset link.';
      return res.redirect('/admin/login');
    }

    if (row.expires_at && new Date(row.expires_at) < new Date()) {
      // remove it
      try {
        await adminResetModel.deleteToken(token);
      } catch (e) {
        /* ignore */
      }
      req.session.error = 'Reset link has expired.';
      return res.redirect('/admin/login');
    }

    // Render reset page with token hidden field
    return res.render('admin/reset', { token });
  } catch (err) {
    console.error('Error in admin.showReset:', err);
    req.session.error = 'Could not open reset page.';
    return res.redirect('/admin/login');
  }
};

// POST /admin/reset (token + password)
exports.reset = async (req, res) => {
  try {
    const token = req.body && req.body.token ? String(req.body.token) : null;
    const password =
      req.body && req.body.password ? String(req.body.password) : null;

    if (!token || !password) {
      req.session.error = 'Missing token or password.';
      return res.redirect('/admin/login');
    }

    // Password policy check (same as clients)
    const pwPattern =
      /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[^a-zA-Z0-9])(?!.*\s).{8,}$/;
    if (!pwPattern.test(password)) {
      req.session.error = 'Password does not meet complexity requirements.';
      return res.redirect(`/admin/reset?token=${encodeURIComponent(token)}`);
    }

    const row = await adminResetModel.findToken(token);
    if (!row) {
      req.session.error = 'Invalid or expired reset link.';
      return res.redirect('/admin/login');
    }
    if (row.expires_at && new Date(row.expires_at) < new Date()) {
      try {
        await adminResetModel.deleteToken(token);
      } catch (e) {
        /* ignore */
      }
      req.session.error = 'Reset link has expired.';
      return res.redirect('/admin/login');
    }

    const adminId = row.admin_id;
    const SALT_ROUNDS = Number(process.env.SALT_ROUNDS || 10);
    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash(password, SALT_ROUNDS);

    // update password
    await adminModel.updatePassword(adminId, hash);

    // consume tokens for this admin (including the used one)
    try {
      await adminResetModel.deleteTokensForAdmin(adminId);
    } catch (e) {
      /* ignore */
    }

    req.session.success = 'Password updated. You can now sign in.';
    return res.redirect('/admin/login');
  } catch (err) {
    console.error('Error in admin.reset:', err);
    req.session.error = 'Could not reset password.';
    return res.redirect('/admin/login');
  }
};

// Admin dashboard: simple counters for pending vendors/orders + weeklyPlansCount
exports.dashboard = async (req, res) => {
  try {
    const vendorsCount = await adminModel.countPendingVendors();
    const ordersCount = await adminModel.countPendingOrders();

    // compute weekly plans pending count (best-effort)
    let weeklyPlansCount = 0;
    try {
      const pendingPlans = await weeklyPlanModel.getPendingPlansForAdmin();
      weeklyPlansCount = Array.isArray(pendingPlans) ? pendingPlans.length : 0;
    } catch (e) {
      // non-fatal — still render dashboard
      console.warn('Could not compute weeklyPlansCount', e);
    }

    return res.render('admin/dashboard', {
      vendorsCount,
      ordersCount,
      weeklyPlansCount,
    });
  } catch (err) {
    console.error('Error loading admin dashboard:', err);
    req.session.error = 'Error loading admin dashboard';
    return res.redirect('/');
  }
};

// List pending vendors for review
exports.pendingVendors = async (req, res) => {
  try {
    const vendors = await vendorModel.getPendingVendors();
    return res.render('admin/vendors-pending', { vendors });
  } catch (err) {
    console.error('Error loading pending vendors:', err);
    req.session.error = 'Error loading vendor requests';
    return res.redirect('/admin/dashboard');
  }
};

// Approve or reject a vendor
exports.vendorDecision = async (req, res) => {
  try {
    const { vendorId, decision, reason } = req.body;
    const status = decision === 'approve' ? 'approved' : 'rejected';

    await vendorModel.updateStatus(vendorId, status);

    try {
      const vendor = await vendorModel.findById(vendorId);
      if (vendor && vendor.email) {
        const subject =
          status === 'approved'
            ? 'Your MyPadiFood vendor application has been approved'
            : 'Your MyPadiFood vendor application has been declined';
        const html =
          status === 'approved'
            ? `<p>Hi ${vendor.name || 'Vendor'},</p><p>Good news — your vendor application has been <strong>approved</strong>. You can now use the MyPadiFood platform to receive orders.</p>`
            : `<p>Hi ${vendor.name || 'Vendor'},</p><p>We are sorry to inform you that your vendor application was <strong>rejected</strong>.</p><p>Reason: ${reason ? String(reason) : 'No reason provided'}.</p>`;
        const text = html.replace(/<\/?[^>]+(>|$)/g, '');
        await sendMail({ to: vendor.email, subject, html, text });
      }
    } catch (mailErr) {
      console.error('Failed to notify vendor by email (non-fatal):', mailErr);
    }

    req.session.success = `Vendor ${status}`;
    return res.redirect('/admin/vendors/pending');
  } catch (err) {
    console.error('Error applying vendor decision:', err);
    req.session.error = 'Error applying decision';
    return res.redirect('/admin/vendors/pending');
  }
};

// Create a new admin
exports.createAdmin = async (req, res) => {
  try {
    if (!req.session.user || req.session.user.type !== 'super') {
      req.session.error = 'Only super admin can create new admins';
      return res.redirect('/admin/dashboard');
    }

    const { name, email, password, role, region_state, region_lga } = req.body;
    if (!name || !email || !password || !role) {
      req.session.error = 'Missing required fields';
      return res.redirect('/admin/create');
    }

    const password_hash = await bcrypt.hash(password, 10);
    await adminModel.createAdmin({
      name,
      email,
      password_hash,
      role,
      region_state,
      region_lga,
    });

    req.session.success = 'Admin created';
    return res.redirect('/admin/dashboard');
  } catch (err) {
    console.error('Error creating admin:', err);
    req.session.error = 'Error creating admin';
    return res.redirect('/admin/create');
  }
};

/* ---------------------------
   ORDERS: existing admin handlers
   --------------------------- */

// List pending orders for admin review
exports.pendingOrdersForAdmin = async (req, res) => {
  try {
    const rows = await orderModel.getPendingOrdersForAdmin();

    // If client requested JSON (AJAX), return data for client-side rendering
    if (
      req.query.format === 'json' ||
      req.xhr ||
      req.headers.accept?.includes('application/json')
    ) {
      return res.json({ ok: true, orders: rows });
    }

    // Otherwise render the HTML page (existing behavior)
    return res.render('admin/orders-pending', { orders: rows });
  } catch (err) {
    console.error('Error loading pending orders for admin:', err);
    req.session.error = 'Error loading orders';
    return res.redirect('/admin/dashboard');
  }
};

// List completed orders
exports.completedOrdersForAdmin = async (req, res) => {
  try {
    const rows = await orderModel.getCompletedOrdersForAdmin();

    if (
      req.query.format === 'json' ||
      req.xhr ||
      req.headers.accept?.includes('application/json')
    ) {
      return res.json({ ok: true, orders: rows });
    }

    return res.render('admin/orders-completed', { orders: rows });
  } catch (err) {
    console.error('Error loading completed orders for admin:', err);
    req.session.error = 'Error loading completed orders';
    return res.redirect('/admin/dashboard');
  }
};

// View single order (admin view) - includes messages
exports.viewOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await orderModel.findById(orderId);
    if (!order) {
      req.session.error = 'Order not found';
      return res.redirect('/admin/orders/pending');
    }

    // get messages (assume messageModel.getMessagesByOrder already returns display_name/client_name/admin_name)
    const messages = await messageModel.getMessagesByOrder(orderId, 500);

    // mark messages as read for admin (so unread badges clear)
    try {
      await messageModel.markReadByAdmin(orderId);
    } catch (e) {
      // non-fatal
      console.warn('markReadByAdmin failed', e);
    }

    return res.render('admin/order-view', { order, messages });
  } catch (err) {
    console.error('Error loading order view:', err);
    req.session.error = 'Error loading order';
    return res.redirect('/admin/orders/pending');
  }
};

// Admin accepts an order: assign admin, set status = accepted
exports.acceptOrder = async (req, res) => {
  try {
    if (
      !req.session.user ||
      !(
        req.session.user.type === 'admin' ||
        req.session.user.type === 'super' ||
        req.session.user.type === 'agent'
      )
    ) {
      req.session.error = 'Only admins may accept orders';
      return res.redirect('/admin/orders/pending');
    }

    const adminId = req.session.user.id;
    const adminName = req.session.user.name || 'Agent';
    const { orderId } = req.params;

    const assigned = await orderModel.assignAdmin(orderId, adminId);
    if (!assigned) {
      req.session.error = 'Could not assign admin to order';
      return res.redirect('/admin/orders/pending');
    }

    // Add a short admin message
    const adminMessage = `Hello, my name is ${adminName}. I will handle your request and notify you of updates.`;
    const createdMsg = await messageModel.createMessage({
      orderId,
      senderType: 'admin',
      senderId: adminId,
      message: adminMessage,
      metadata: {},
    });

    // Emit updates via sockets
    const io = socketUtil.get();
    if (io) {
      // notify clients in the order room and all admins
      io.to(`order_${orderId}`).emit('new_message', createdMsg);
      io.to('admins').emit('order_message', { orderId, message: createdMsg });

      // notify admin dashboards to update the order list entry
      io.to('admins').emit('order_updated', {
        orderId,
        status: 'accepted',
        assigned_admin: adminId,
        assigned_admin_name: adminName,
      });
    }

    req.session.success = 'You accepted the order and notified the client';
    return res.redirect(`/admin/orders/${orderId}`);
  } catch (err) {
    console.error('acceptOrder error', err);
    req.session.error = 'Could not accept order';
    return res.redirect('/admin/orders/pending');
  }
};

// completeOrder (mark done/completed) ---
exports.completeOrder = async (req, res) => {
  try {
    if (
      !req.session.user ||
      !(
        req.session.user.type === 'admin' ||
        req.session.user.type === 'super' ||
        req.session.user.type === 'agent'
      )
    ) {
      req.session.error = 'Only admins may complete orders';
      return res.redirect('/admin/orders/pending');
    }

    const adminId = req.session.user.id;
    const { orderId } = req.params;

    // Optionally check assignment: allow if assigned_admin === adminId OR super admin
    const order = await orderModel.findById(orderId);
    if (!order) {
      req.session.error = 'Order not found';
      return res.redirect('/admin/orders/pending');
    }

    const isAssigned =
      order.assigned_admin && String(order.assigned_admin) === String(adminId);
    const isSuper = req.session.user.type === 'super';
    if (!isAssigned && !isSuper) {
      req.session.error = 'You are not assigned to this order';
      return res.redirect(`/admin/orders/${orderId}`);
    }

    // mark as completed
    const updated = await orderModel.updateStatus(orderId, 'completed');
    if (!updated) {
      req.session.error = 'Could not mark order completed';
      return res.redirect(`/admin/orders/${orderId}`);
    }

    // create an admin system message indicating completion
    const adminName = req.session.user.name || 'Agent';
    const completionMsg = `${adminName} marked this order as completed / delivered. Payment settled.`;
    const createdMsg = await messageModel.createMessage({
      orderId,
      senderType: 'admin',
      senderId: adminId,
      message: completionMsg,
      metadata: { action: 'completed' },
    });

    const io = socketUtil.get();
    if (io) {
      // notify order participants and admins
      io.to(`order_${orderId}`).emit('new_message', createdMsg);
      io.to('admins').emit('order_message', { orderId, message: createdMsg });

      // instruct admin dashboards to mark this order completed (grey-out)
      io.to('admins').emit('order_completed', { orderId });
    }

    req.session.success = 'Order marked completed';
    return res.redirect(`/admin/orders/${orderId}`);
  } catch (err) {
    console.error('completeOrder error', err);
    req.session.error = 'Could not mark order as completed';
    return res.redirect('/admin/orders/pending');
  }
};

/* ---------------------------
   WEEKLY PLANS: admin handlers
   --------------------------- */

exports.pendingWeeklyPlans = async (req, res) => {
  try {
    const rows = await weeklyPlanModel.getPendingPlansForAdmin();
    if (
      req.query.format === 'json' ||
      req.xhr ||
      req.headers.accept?.includes('application/json')
    ) {
      return res.json({ ok: true, plans: rows });
    }
    return res.render('admin/food-orders', {
      plans: rows,
      pageScripts: ['/js/admin-food-orders.js'],
    });
  } catch (err) {
    console.error('Error loading pending weekly plans for admin:', err);
    req.session.error = 'Error loading weekly plans';
    return res.redirect('/admin/dashboard');
  }
};

exports.viewWeeklyPlan = async (req, res) => {
  try {
    const { planId } = req.params;
    const plan = await weeklyPlanModel.getPlanWithItems(planId);
    if (!plan) {
      req.session.error = 'Weekly plan not found';
      return res.redirect('/admin/food-orders');
    }
    const messages = await weeklyPlanMessageModel.getMessagesByPlan(
      planId,
      500
    );
    try {
      // mark weekly plan messages as read by admin (best-effort)
      await weeklyPlanMessageModel.markReadByAdmin(planId);
    } catch (e) {
      /* non-fatal */
    }
    return res.render('admin/food-order-view', {
      plan,
      messages,
      pageScripts: ['/js/admin-food-orders.js'],
    });
  } catch (err) {
    console.error('Error loading weekly plan view:', err);
    req.session.error = 'Error loading weekly plan';
    return res.redirect('/admin/food-orders');
  }
};

exports.acceptWeeklyPlan = async (req, res) => {
  try {
    if (
      !req.session.user ||
      !(req.session.user.type === 'admin' || req.session.user.type === 'super')
    ) {
      req.session.error = 'Only admins may accept weekly plans';
      return res.redirect('/admin/food-orders');
    }
    const adminId = req.session.user.id;
    const { planId } = req.params;
    const assigned = await weeklyPlanModel.assignAdmin(planId, adminId);
    if (!assigned) {
      req.session.error = 'Could not assign admin';
      return res.redirect('/admin/food-orders');
    }
    // create notification
    if (
      notificationModel &&
      typeof notificationModel.createNotification === 'function'
    ) {
      try {
        // IMPORTANT: Do NOT put weekly plan id into order_id (FK->orders). Use null here
        await notificationModel.createNotification({
          order_id: null,
          type: 'weekly_plan_assigned',
          payload: {
            weekly_plan_id: planId,
            assigned_admin: adminId,
            assigned_admin_name: req.session.user.name,
            assigned_at: new Date(),
          },
        });
      } catch (nerr) {
        console.warn('Could not create assigned notification', nerr);
      }
    }
    // emit via socket
    try {
      const io = require('../utils/socket').get();
      if (io) {
        io.to(`weekly_plan_${planId}`).emit('weekly_plan_message', {
          weekly_plan_id: planId,
          sender_type: 'admin',
          sender_id: adminId,
          message: `Hello, my name is ${req.session.user.name}. I will handle your weekly plan.`,
          created_at: new Date(),
        });
        io.to('admins').emit('weekly_plan_assigned', {
          plan_id: planId,
          assigned_admin: adminId,
          assigned_admin_name: req.session.user.name,
        });
      }
    } catch (e) {
      console.warn('socket emit failed', e);
    }
    req.session.success =
      'You accepted the weekly plan and notified the client';
    return res.redirect(`/admin/food-orders/${planId}`);
  } catch (err) {
    console.error('acceptWeeklyPlan error', err);
    req.session.error = 'Could not accept weekly plan';
    return res.redirect('/admin/food-orders');
  }
};

exports.completeWeeklyPlan = async (req, res) => {
  try {
    if (
      !req.session.user ||
      !(req.session.user.type === 'admin' || req.session.user.type === 'super')
    ) {
      req.session.error = 'Only admins may complete weekly plans';
      return res.redirect('/admin/food-orders');
    }
    const adminId = req.session.user.id;
    const { planId } = req.params;
    const plan = await weeklyPlanModel.getPlanWithItems(planId);
    if (!plan) {
      req.session.error = 'Plan not found';
      return res.redirect('/admin/food-orders');
    }
    const isAssigned =
      plan.assigned_admin && String(plan.assigned_admin) === String(adminId);
    const isSuper = req.session.user.type === 'super';
    if (!isAssigned && !isSuper) {
      req.session.error = 'You are not assigned to this weekly plan';
      return res.redirect(`/admin/food-orders/${planId}`);
    }
    const updated = await weeklyPlanModel.updateStatus(planId, 'completed');
    if (!updated) {
      req.session.error = 'Could not mark weekly plan completed';
      return res.redirect(`/admin/food-orders/${planId}`);
    }
    // create message + emit
    try {
      await weeklyPlanMessageModel.createMessage({
        weeklyPlanId: planId,
        senderType: 'admin',
        senderId: adminId,
        message: `${req.session.user.name} marked this weekly plan as completed / delivered.`,
        metadata: { action: 'completed' },
      });
    } catch (merr) {
      console.warn('Could not create weekly plan completion message', merr);
    }
    try {
      const io = require('../utils/socket').get();
      if (io) {
        io.to(`weekly_plan_${planId}`).emit('weekly_plan_message', {
          weekly_plan_id: planId,
          sender_type: 'admin',
          sender_id: adminId,
          message: `${req.session.user.name} marked this plan as completed.`,
          created_at: new Date(),
        });
        io.to('admins').emit('weekly_plan_completed', { plan_id: planId });
      }
    } catch (e) {
      /* ignore */
    }
    req.session.success = 'Weekly plan marked completed';
    return res.redirect(`/admin/food-orders/${planId}`);
  } catch (err) {
    console.error('completeWeeklyPlan error', err);
    req.session.error = 'Could not mark weekly plan as completed';
    return res.redirect('/admin/food-orders');
  }
};

// GET /admin/resources
exports.resourcesPage = async (req, res) => {
  try {
    const statesLGAs = loadStatesLGAs();
    // Optionally provide initial data (empty)
    return res.render('admin/resources', { statesLGAs });
  } catch (e) {
    console.error('Error rendering admin resources page', e);
    req.session.error = 'Could not open resources page';
    return res.redirect('/admin/dashboard');
  }
};

// GET /admin/resources/data?type=vendors|riders&state=...&lga=...
exports.resourcesData = async (req, res) => {
  try {
    const type = String(req.query.type || 'vendors');
    const state = req.query.state ? String(req.query.state).trim() : null;
    const lga = req.query.lga ? String(req.query.lga).trim() : null;

    if (type === 'vendors') {
      const rows = await vendorModel.getApprovedVendors({ state, lga, q: null });
      return res.json({ ok: true, type: 'vendors', rows });
    } else if (type === 'riders') {
      const rows = await riderModel.getApprovedRiders({ state, lga });
      return res.json({ ok: true, type: 'riders', rows });
    } else {
      return res.status(400).json({ ok: false, error: 'Invalid type' });
    }
  } catch (err) {
    console.error('Error loading resources data', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
};



// List pending riders for review
exports.pendingRiders = async (req, res) => {
  try {
    const riders = await riderModel.getPendingRiders();
    return res.render('admin/riders-pending', { riders });
  } catch (err) {
    console.error('Error loading pending riders:', err);
    req.session.error = 'Error loading rider requests';
    return res.redirect('/admin/dashboard');
  }
};

// Approve or reject a rider
exports.riderDecision = async (req, res) => {
  try {
    const { riderId, decision, reason } = req.body;
    const status = decision === 'approve' ? 'approved' : 'rejected';

    await riderModel.updateStatus(riderId, status);

    try {
      const rider = await riderModel.findById(riderId);
      if (rider && rider.email) {
        const subject =
          status === 'approved'
            ? 'Your MyPadiFood rider application has been approved'
            : 'Your MyPadiFood rider application has been declined';
        const html =
          status === 'approved'
            ? `<p>Hi ${rider.full_name || 'Rider'},</p><p>Good news — your rider application has been <strong>approved</strong>. We will contact you with onboarding details shortly.</p>`
            : `<p>Hi ${rider.full_name || 'Rider'},</p><p>We are sorry to inform you that your rider application was <strong>rejected</strong>.</p><p>Reason: ${reason ? String(reason) : 'No reason provided'}.</p>`;
        const text = html.replace(/<\/?[^>]+(>|$)/g, '');
        await sendMail({ to: rider.email, subject, html, text });
      }
    } catch (mailErr) {
      console.error('Failed to notify rider by email (non-fatal):', mailErr);
    }

    req.session.success = `Rider ${status}`;
    return res.redirect('/admin/riders/pending');
  } catch (err) {
    console.error('Error applying rider decision:', err);
    req.session.error = 'Error applying decision';
    return res.redirect('/admin/riders/pending');
  }
};

// GET /admin/resources/export?type=vendors|riders&state=...&lga=...
exports.resourcesExport = async (req, res) => {
  try {
    const type = String(req.query.type || 'vendors');
    const state = req.query.state ? String(req.query.state).trim() : null;
    const lga = req.query.lga ? String(req.query.lga).trim() : null;

    let rows = [];
    if (type === 'vendors') {
      rows = await vendorModel.getApprovedVendors({ state, lga, q: null });
      // CSV headers for vendors
      const cols = ['Name', 'Address', 'Phone', 'Email', 'State', 'LGA', 'Base Price'];
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="vendors_${state||'all'}_${lga||'all'}.csv"`);
      const out = [cols.join(',')].concat(rows.map(r => {
        const safe = v => (v == null ? '' : `"${String(v).replace(/"/g, '""')}"`);
        return [safe(r.name), safe(r.address), safe(r.phone), safe(r.email), safe(r.state), safe(r.lga), safe(r.base_price)].join(',');
      })).join('\r\n');
      return res.send(out);
    } else if (type === 'riders') {
      rows = await riderModel.getApprovedRiders({ state, lga });
      const cols = ['Name', 'Address', 'Phone', 'Email', 'State', 'LGA', 'Vehicle Type', 'Vehicle Number'];
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="riders_${state||'all'}_${lga||'all'}.csv"`);
      const out = [cols.join(',')].concat(rows.map(r => {
        const safe = v => (v == null ? '' : `"${String(v).replace(/"/g, '""')}"`);
        return [safe(r.full_name), safe(r.address), safe(r.phone), safe(r.email), safe(r.state), safe(r.lga), safe(r.vehicle_type), safe(r.vehicle_number)].join(',');
      })).join('\r\n');
      return res.send(out);
    } else {
      return res.status(400).send('Invalid type');
    }
  } catch (err) {
    console.error('Error exporting resources CSV', err);
    return res.status(500).send('Server error');
  }
};

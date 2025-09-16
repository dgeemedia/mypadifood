// controllers/adminController.js
// Admin authentication + dashboard + vendor approval + create admin
// Also: admin order review, accept order, and notify via sockets

const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const models = require('../models'); // { client, vendor, admin, order, verification, message }
const adminModel = models.admin;
const vendorModel = models.vendor;
const orderModel = models.order;
const messageModel = models.message;

const socketUtil = require('../utils/socket'); // for emitting socket events
const { sendMail } = require('../utils/mailer'); // email helper

// Helper to load states/LGAs JSON safely
function loadStatesLGAs() {
  try {
    const file = path.join(__dirname, '..', 'locations', 'Nigeria-State-Lga.json');
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.error('Could not load statesLGAs:', e);
  }
  return [];
}

// ----------------------------
// Admin auth + basic pages
// ----------------------------

// Render admin login page
exports.showLogin = (req, res) => {
  return res.render('login', { userType: 'admin' });
};

// Render create-admin form (protected by route middleware)
exports.showCreateForm = (req, res) => {
  const statesLGAs = loadStatesLGAs();
  return res.render('admin-create', { statesLGAs });
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

    // session user: type 'super' for super admins, otherwise 'admin'
    req.session.user = {
      id: admin.id,
      type: admin.role === 'super' ? 'super' : 'admin',
      name: admin.name,
      email: admin.email
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
  req.session.destroy(err => {
    if (err) console.error('Admin logout error:', err);
    res.clearCookie('connect.sid');
    return res.redirect('/');
  });
};

// Admin dashboard: simple counters for pending vendors/orders
exports.dashboard = async (req, res) => {
  try {
    const vendorsCount = await adminModel.countPendingVendors();
    const ordersCount = await adminModel.countPendingOrders();
    return res.render('admin-dashboard', { vendorsCount, ordersCount });
  } catch (err) {
    console.error('Error loading admin dashboard:', err);
    req.session.error = 'Error loading admin dashboard';
    return res.redirect('/');
  }
};

// ----------------------------
// Vendor approval flows
// ----------------------------

// List pending vendors for review
exports.pendingVendors = async (req, res) => {
  try {
    const vendors = await vendorModel.getPendingVendors();
    return res.render('admin-vendors-pending', { vendors });
  } catch (err) {
    console.error('Error loading pending vendors:', err);
    req.session.error = 'Error loading vendor requests';
    return res.redirect('/admin/dashboard');
  }
};

// Approve or reject a vendor (form posts vendorId + decision + optional reason)
exports.vendorDecision = async (req, res) => {
  try {
    const { vendorId, decision, reason } = req.body;
    const status = decision === 'approve' ? 'approved' : 'rejected';

    // Update vendor status
    await vendorModel.updateStatus(vendorId, status);

    // Attempt to notify vendor by email (best-effort)
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
        const text = html.replace(/<\/?[^>]+(>|$)/g, ''); // simple text fallback

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

// ----------------------------
// Admin creation
// ----------------------------

// Create a new admin (protected route — only super/admin as per your middleware)
exports.createAdmin = async (req, res) => {
  try {
    // Only allow when session user is super — middleware should already restrict but double-check
    if (!req.session.user || req.session.user.type !== 'super') {
      req.session.error = 'Only super admin can create new admins';
      return res.redirect('/admin/dashboard');
    }

    const { name, email, password, role, region_state, region_lga } = req.body;
    if (!name || !email || !password || !role) {
      req.session.error = 'Missing required fields';
      return res.redirect('/admin/create');
    }

    // Hash password before creating
    const password_hash = await bcrypt.hash(password, 10);
    await adminModel.createAdmin({ name, email, password_hash, role, region_state, region_lga });

    req.session.success = 'Admin created';
    return res.redirect('/admin/dashboard');
  } catch (err) {
    console.error('Error creating admin:', err);
    req.session.error = 'Error creating admin';
    return res.redirect('/admin/create');
  }
};

// ----------------------------
// Orders & chat: admin views/actions
// ----------------------------

// List pending orders for admin review
exports.pendingOrdersForAdmin = async (req, res) => {
  try {
    const rows = await orderModel.getPendingOrdersForAdmin();
    return res.render('admin-orders-pending', { orders: rows });
  } catch (err) {
    console.error('Error loading pending orders for admin:', err);
    req.session.error = 'Error loading orders';
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
    const messages = await messageModel.getMessagesByOrder(orderId, 500);
    return res.render('admin-order-view', { order, messages });
  } catch (err) {
    console.error('Error loading order view:', err);
    req.session.error = 'Error loading order';
    return res.redirect('/admin/orders/pending');
  }
};

// Admin accepts an order: assign admin, set status = accepted, create initial admin message and notify sockets
exports.acceptOrder = async (req, res) => {
  try {
    // ensure user is admin
    if (!req.session.user || !(req.session.user.type === 'admin' || req.session.user.type === 'super' || req.session.user.type === 'agent')) {
      req.session.error = 'Only admins may accept orders';
      return res.redirect('/admin/orders/pending');
    }

    const adminId = req.session.user.id;
    const { orderId } = req.params;

    // assign admin (this function should set assigned_admin and status='accepted')
    const assigned = await orderModel.assignAdmin(orderId, adminId);
    if (!assigned) {
      req.session.error = 'Could not assign admin to order';
      return res.redirect('/admin/orders/pending');
    }

    // create an admin message announcing acceptance
    const adminName = req.session.user.name || 'Agent';
    const adminMessage = `Hello, my name is ${adminName}. I will get your food request delivered to you as soon as possible. I will calculate any additional items and communicate the updated total.`;
    const createdMsg = await messageModel.createMessage({
      orderId,
      senderType: 'admin',
      senderId: adminId,
      message: adminMessage,
      metadata: {}
    });

    // emit socket events to order room and to admins dashboard
    const io = socketUtil.get();
    if (io) {
      io.to(`order_${orderId}`).emit('new_message', createdMsg);
      io.to('admins').emit('order_message', { orderId, message: createdMsg });
    }

    req.session.success = 'You accepted the order and notified the client';
    return res.redirect(`/admin/orders/${orderId}`);
  } catch (err) {
    console.error('acceptOrder error', err);
    req.session.error = 'Could not accept order';
    return res.redirect('/admin/orders/pending');
  }
};

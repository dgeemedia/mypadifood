// controllers/adminController.js
const { pool } = require('../database/database');
const bcrypt = require('bcryptjs'); // bcryptjs is cross-platform

// render admin login
exports.showLogin = (req, res) => res.render('login', { userType: 'admin' });

// render create admin form (super only)
exports.showCreateForm = (req, res) => {
  // optionally pass statesLGAs if you want to scope admin to region
  const statesLGAs = require('../locations/Nigeria-State-Lga.json');
  res.render('admin-create', { statesLGAs });
};

// handle admin login
exports.login = async (req, res) => {
  const { email, password } = req.body;
  try {
    const { rows } = await pool.query('SELECT * FROM admins WHERE email=$1', [email]);
    if (!rows.length) {
      req.session.error = 'Invalid credentials';
      return res.redirect('/admin/login');
    }

    const admin = rows[0];
    const ok = await bcrypt.compare(password, admin.password_hash);
    if (!ok) {
      req.session.error = 'Invalid credentials';
      return res.redirect('/admin/login');
    }

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

// logout
exports.logout = (req, res) => {
  req.session.destroy(err => {
    if (err) console.error('Admin logout error:', err);
    res.clearCookie('connect.sid');
    return res.redirect('/');
  });
};

// dashboard
exports.dashboard = async (req, res) => {
  try {
    const vendorsCount = (await pool.query("SELECT count(*) FROM vendors WHERE status='pending'")).rows[0].count;
    const ordersCount  = (await pool.query("SELECT count(*) FROM orders WHERE status='pending'")).rows[0].count;
    return res.render('admin-dashboard', { vendorsCount, ordersCount });
  } catch (err) {
    console.error('Error loading admin dashboard:', err);
    req.session.error = 'Error loading admin dashboard';
    return res.redirect('/');
  }
};

// pending vendors
exports.pendingVendors = async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM vendors WHERE status='pending' ORDER BY created_at DESC");
    return res.render('admin-vendors-pending', { vendors: rows });
  } catch (err) {
    console.error('Error loading pending vendors:', err);
    req.session.error = 'Error loading vendor requests';
    return res.redirect('/admin/dashboard');
  }
};

// approve/reject vendor
exports.vendorDecision = async (req, res) => {
  try {
    const { vendorId, decision, reason } = req.body;
    const status = decision === 'approve' ? 'approved' : 'rejected';
    await pool.query('UPDATE vendors SET status=$1 WHERE id=$2', [status, vendorId]);

    // TODO: send email or SMS on rejection including reason
    req.session.success = `Vendor ${status}`;
    return res.redirect('/admin/vendors/pending');
  } catch (err) {
    console.error('Error applying vendor decision:', err);
    req.session.error = 'Error applying decision';
    return res.redirect('/admin/vendors/pending');
  }
};

// create admin (super only)
exports.createAdmin = async (req, res) => {
  try {
    if (!req.session.user || req.session.user.type !== 'super') {
      req.session.error = 'Only super admin can create new admins';
      return res.redirect('/admin/dashboard');
    }
    const { name, email, password, role, region_state, region_lga } = req.body;
    const password_hash = await bcrypt.hash(password, 10);
    await pool.query(
      'INSERT INTO admins (name,email,password_hash,role,region_state,region_lga) VALUES ($1,$2,$3,$4,$5,$6)',
      [name, email, password_hash, role, region_state, region_lga]
    );
    req.session.success = 'Admin created';
    return res.redirect('/admin/dashboard');
  } catch (err) {
    console.error('Error creating admin:', err);
    req.session.error = 'Error creating admin';
    return res.redirect('/admin/dashboard');
  }
};

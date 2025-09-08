// controllers/adminController.js
const Vendor = require('../models/vendorModel');
const User = require('../models/userModel');
const sendAdminEmail = require('../utilities/smsEmail');
const db = require('../models/db');
const bcrypt = require('bcryptjs');

const allowedRoles = ['customer', 'vendor', 'admin', 'manager'];

exports.unverified = async (req, res) => {
  try {
    const list = await Vendor.getAll({ verified_only: false });
    const unverified = list.filter(v => v.status === 'unverified');
    res.render('admin', { title: 'Admin', vendors: unverified });
  } catch (err) {
    console.error(err);
    if (req.setFlash) req.setFlash('error', 'Could not load unverified vendors.');
    res.redirect('/admin');
  }
};

exports.verify = async (req, res) => {
  const admin = req.session.user;
  if (!admin || admin.role !== 'admin') {
    if (req.setFlash) req.setFlash('error', 'Forbidden: admin only.');
    return res.redirect('/admin');
  }
  const id = req.params.id;
  try {
    await Vendor.verifyVendor(id, admin.id);
    // best-effort email
    try {
      await sendAdminEmail('Vendor verified', `Vendor ${id} verified by ${admin.name}`);
    } catch (e) {
      console.warn('Email failed', e);
    }
    if (req.setFlash) req.setFlash('success', 'Vendor verified successfully.');
    res.redirect('/admin');
  } catch (err) {
    console.error(err);
    if (req.setFlash) req.setFlash('error', 'Could not complete action. Try again.');
    res.redirect('/admin');
  }
};

// list users
exports.listUsers = async (req, res) => {
  try {
    const users = await User.listAll();
    res.render('admin_users', { title: 'Manage Users', users });
  } catch (err) {
    console.error(err);
    if (req.setFlash) req.setFlash('error', 'Could not load users.');
    res.redirect('/admin');
  }
};

// create or update a manager/admin
exports.createManager = async (req, res) => {
  try {
    const { name, email, password, role = 'manager' } = req.body;
    if (!allowedRoles.includes(role)) {
      if (req.setFlash) req.setFlash('error', 'Invalid role');
      return res.redirect('/admin/users');
    }

    const found = await User.findByEmail(email);
    const hashed = await bcrypt.hash(password, 10);

    if (found) {
      // update role and password
      await User.updateRole(found.id, role);
      await db.query('UPDATE users SET name=$1, password_hash=$2 WHERE id=$3', [name, hashed, found.id]);
      if (req.setFlash) req.setFlash('success', 'User created/updated successfully.');
      return res.redirect('/admin/users');
    } else {
      await db.query('INSERT INTO users (name,email,phone,password_hash,role) VALUES ($1,$2,$3,$4,$5)', [name, email, null, hashed, role]);
      if (req.setFlash) req.setFlash('success', 'User created/updated successfully.');
      return res.redirect('/admin/users');
    }
  } catch (err) {
    console.error('createManager error', err);
    if (req.setFlash) req.setFlash('error', 'Could not complete action. Try again.');
    res.redirect('/admin/users');
  }
};

// assign role to existing user
exports.assignRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;
    if (!allowedRoles.includes(role)) {
      if (req.setFlash) req.setFlash('error', 'Invalid role');
      return res.redirect('/admin/users');
    }
    await User.updateRole(id, role);
    if (req.setFlash) req.setFlash('success', 'User role updated successfully.');
    res.redirect('/admin/users');
  } catch (err) {
    console.error(err);
    if (req.setFlash) req.setFlash('error', 'Could not complete action. Try again.');
    res.redirect('/admin/users');
  }
};

// delete user (admin only) — prevents deleting last admin
exports.deleteUser = async (req, res) => {
  try {
    const admin = req.session.user;
    if (!admin || admin.role !== 'admin') {
      if (req.setFlash) req.setFlash('error', 'Forbidden: admin only.');
      return res.redirect('/admin/users');
    }

    const { id } = req.params;
    const target = await User.getById(id);
    if (!target) {
      if (req.setFlash) req.setFlash('error', 'User not found.');
      return res.redirect('/admin/users');
    }

    if (target.role === 'admin') {
      const adminCount = await User.countAdmins();
      if (adminCount <= 1) {
        if (req.setFlash) req.setFlash('error', 'Cannot delete the last admin account.');
        return res.redirect('/admin/users');
      }
    }

    const deleted = await User.deleteById(id);
    if (!deleted) {
      if (req.setFlash) req.setFlash('error', 'User not found.');
      return res.redirect('/admin/users');
    }

    try {
      await sendAdminEmail('User deleted', `User ${deleted.email} was removed by ${admin.email}`);
    } catch (e) {
      console.warn('Delete email failed', e);
    }

    if (req.setFlash) req.setFlash('success', 'User deleted successfully.');
    return res.redirect('/admin/users');
  } catch (err) {
    console.error('deleteUser error', err);
    if (req.setFlash) req.setFlash('error', 'Could not complete action. Try again.');
    res.redirect('/admin/users');
  }
};

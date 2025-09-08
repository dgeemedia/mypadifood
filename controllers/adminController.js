// controllers/adminController.js
const Vendor = require('../models/vendorModel');
const User = require('../models/userModel');
const sendAdminEmail = require('../utilities/smsEmail');

exports.unverified = async (req, res) => {
  try {
    const list = await Vendor.getAll({ verified_only: false });
    const unverified = list.filter(v => v.status === 'unverified');
    res.render('admin', { title: 'Admin', vendors: unverified });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
};

exports.verify = async (req, res) => {
  const admin = req.session.user;
  if (!admin || admin.role !== 'admin') return res.status(403).send('forbidden');
  const id = req.params.id;
  try {
    await Vendor.verifyVendor(id, admin.id);
    await sendAdminEmail('Vendor verified', `Vendor ${id} verified by ${admin.name}`);
    res.redirect('/admin');
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
};

// --- user management (admins/managers)
exports.listUsers = async (req, res) => {
  try {
    const users = await User.listAll();
    res.render('admin_users', { title: 'Manage Users', users });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
};

exports.createManager = async (req, res) => {
  // form POST: { name, email, password, role }
  try {
    const { name, email, password, role = 'manager' } = req.body;
    // reuse create_or_update pattern: update if exists
    const bcrypt = require('bcryptjs');
    const found = await User.findByEmail(email);
    const hashed = await bcrypt.hash(password, 10);
    if (found) {
      await User.updateRole(found.id, role);
      await require('../models/db').query(
        'UPDATE users SET name=$1, password_hash=$2 WHERE id=$3',
        [name, hashed, found.id]
      );
      return res.redirect('/admin/users');
    } else {
      await require('../models/db').query(
        'INSERT INTO users (name,email,phone,password_hash,role) VALUES ($1,$2,$3,$4,$5)',
        [name, email, null, hashed, role]
      );
      return res.redirect('/admin/users');
    }
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
};

exports.assignRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;
    await User.updateRole(id, role);
    res.redirect('/admin/users');
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
};

const Vendor = require('../models/vendorModel');
const sendAdminEmail = require('../utilities/smsEmail');

exports.unverified = async (req, res) => {
  const list = await Vendor.getAll({ verified_only: false });
  const unverified = list.filter(v => v.status === 'unverified');
  res.render('admin', { title: 'Admin', vendors: unverified });
};

exports.verify = async (req, res) => {
  const admin = req.session.user;
  if (!admin || admin.role !== 'admin') return res.status(403).send('forbidden');
  const id = req.params.id;
  await Vendor.verifyVendor(id, admin.id);
  await sendAdminEmail('Vendor verified', `Vendor ${id} verified by ${admin.name}`);
  res.redirect('/admin');
};

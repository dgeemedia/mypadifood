const bcrypt = require('bcryptjs');
const User = require('../models/userModel');
const Wallet = require('../models/walletModel');

exports.showSignup = (req, res) => {
  res.render('signup', { title: 'Sign up' });
};

exports.signup = async (req, res) => {
  try {
    const { name, email, phone, password, role = 'customer' } = req.body;
    const exists = await User.findByEmail(email);
    if (exists) return res.status(400).send('Email already registered');
    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, phone, password_hash: hashed, role });
    // create wallet for customer
    if (role === 'customer') await Wallet.createForUser(user.id);
    req.session.user = { id: user.id, name: user.name, role: user.role };
    res.redirect('/');
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
};

exports.showLogin = (req, res) => {
  res.render('login', { title: 'Login' });
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findByEmail(email);
    if (!user) return res.status(400).send('Invalid credentials');
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(400).send('Invalid credentials');
    req.session.user = { id: user.id, name: user.name, role: user.role };
    res.redirect('/');
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
};

exports.logout = (req, res) => {
  req.session.destroy(() => res.redirect('/'));
};

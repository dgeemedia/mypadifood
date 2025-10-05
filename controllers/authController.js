// controllers/authController.js
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const adminModel = require('../models').admin;
const clientModel = require('../models').client;
require('dotenv').config();

const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET;
const TOKEN_MAX_AGE_MS = Number(process.env.ACCESS_TOKEN_MAX_MS) || 3600 * 1000; // default 1h

if (!ACCESS_TOKEN_SECRET) {
  console.warn('authController: ACCESS_TOKEN_SECRET not set in env');
}

exports.showLogin = (req, res) => {
  // render a single unified login view (you can reuse your existing EJS and adjust)
  return res.render('auth/login', { title: 'Sign in', nav: null, flash: null });
};

// deliver signup choice page
exports.showSignupChoice = (req, res) => {
  try {
    // You can pass nav or other locals if needed
    return res.render('auth/signup-choice', { title: 'Sign up' });
  } catch (err) {
    console.error('showSignupChoice error', err);
    return res.status(500).send('Server error');
  }
};

exports.login = async (req, res) => {
  try {
    let { email, password } = req.body || {};
    email = (email || '').trim();
    // normalize to lower-case (most DBs store canonical lower-case emails)
    const normalizedEmail = email.toLowerCase();

    console.debug('[auth.login] attempt', { email: normalizedEmail, from: req.originalUrl });

    if (!normalizedEmail || !password) {
      console.debug('[auth.login] missing email or password');
      return res.status(400).render('auth/login', { title: 'Sign in', error: 'Missing credentials' });
    }

    // Defensive: ensure models exist
    if (!adminModel || !clientModel) {
      console.error('[auth.login] adminModel or clientModel missing', {
        adminModel: !!adminModel,
        clientModel: !!clientModel,
      });
      return res.status(500).render('auth/login', { title: 'Sign in', error: 'Server error' });
    }

    // 1) try admin table first (case-insensitive)
    let admin = null;
    try {
      admin = await adminModel.findByEmail(normalizedEmail) || await adminModel.findByEmail(email);
      if (admin) console.debug('[auth.login] admin found for', normalizedEmail, { id: admin.id, email: admin.email });
    } catch (e) {
      console.error('[auth.login] adminModel.findByEmail error', e);
    }

    if (admin) {
      const hash = admin.password_hash || admin.password || admin.passwordHash;
      if (!hash) {
        console.error('[auth.login] admin record has no password hash', { admin });
        return res.status(500).render('auth/login', { title: 'Sign in', error: 'Server error' });
      }
      const ok = await bcrypt.compare(password, hash);
      console.debug('[auth.login] bcrypt.compare result for admin:', ok);
      if (!ok) {
        return res.status(401).render('auth/login', { title: 'Sign in', error: 'Invalid credentials' });
      }
      const payload = {
        id: admin.id,
        name: admin.name || admin.display_name || null,
        email: admin.email,
        type: admin.role === 'super' ? 'super' : (admin.role || 'admin'),
      };
      const token = jwt.sign(payload, ACCESS_TOKEN_SECRET, { expiresIn: Math.floor(TOKEN_MAX_AGE_MS / 1000) });
      const cookieOpts = { httpOnly: true, maxAge: TOKEN_MAX_AGE_MS };
      if (process.env.NODE_ENV === 'production') cookieOpts.secure = true;
      res.cookie('jwt', token, cookieOpts);
      return res.redirect('/admin/dashboard');
    }

    // 2) try client table (case-insensitive)
    let client = null;
    try {
      client = await clientModel.findByEmail(normalizedEmail) || await clientModel.findByEmail(email);
      if (client) console.debug('[auth.login] client found for', normalizedEmail, { id: client.id, email: client.email });
    } catch (e) {
      console.error('[auth.login] clientModel.findByEmail error', e);
    }

    if (client) {
      const hash = client.password_hash || client.password || client.passwordHash;
      if (!hash) {
        console.error('[auth.login] client record has no password hash', { client });
        return res.status(500).render('auth/login', { title: 'Sign in', error: 'Server error' });
      }
      const ok = await bcrypt.compare(password, hash);
      console.debug('[auth.login] bcrypt.compare result for client:', ok);
      if (!ok) {
        return res.status(401).render('auth/login', { title: 'Sign in', error: 'Invalid credentials' });
      }
      const payload = {
        id: client.id,
        name: client.full_name || client.name || null,
        email: client.email,
        type: 'client',
      };
      const token = jwt.sign(payload, ACCESS_TOKEN_SECRET, { expiresIn: Math.floor(TOKEN_MAX_AGE_MS / 1000) });
      const cookieOpts = { httpOnly: true, maxAge: TOKEN_MAX_AGE_MS };
      if (process.env.NODE_ENV === 'production') cookieOpts.secure = true;
      res.cookie('jwt', token, cookieOpts);
      return res.redirect('/client/dashboard');
    }

    // not found
    console.debug('[auth.login] no user found for', normalizedEmail);
    return res.status(401).render('auth/login', { title: 'Sign in', error: 'Invalid credentials' });
  } catch (err) {
    console.error('auth.login error', err);
    return res.status(500).render('auth/login', { title: 'Sign in', error: 'Login failed' });
  }
};

exports.logout = (req, res) => {
  try {
    // Clear JWT cookie
    res.clearCookie('jwt');

    // Destroy express session if present
    const finishLogout = () => {
      // Determine redirect target: query ?next=..., or referrer-based heuristic, or home
      const next = req.query.next || null;
      if (next) return res.redirect(next);

      const referer = (req.get('Referer') || '').toLowerCase();
      if (referer.includes('/admin')) return res.redirect('/admin/login');
      if (referer.includes('/client')) return res.redirect('/client/login');

      return res.redirect('/');
    };

    if (req.session) {
      // destroy session and redirect in callback
      req.session.destroy((err) => {
        if (err) {
          console.error('Session destroy error during logout:', err);
          // proceed anyway
        }
        finishLogout();
      });
    } else {
      // no session; just redirect
      return finishLogout();
    }
  } catch (e) {
    console.error('Error in logout:', e);
    // best-effort redirect
    try { res.clearCookie('jwt'); } catch {}
    return res.redirect('/');
  }
};


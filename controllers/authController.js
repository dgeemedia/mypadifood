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
    let { email, password, userType } = req.body || {};
    email = (email || '').trim();
    userType = (userType || '').toString().toLowerCase();

    // Determine whether caller clearly intends a client or admin login.
    // Also inspect the request path (helps when form posts to /client/login).
    const path = (req.originalUrl || req.path || '').toLowerCase();
    const preferClient =
      userType === 'client' ||
      path.includes('/client') ||
      path.includes('/client/login');
    const preferAdmin =
      userType === 'admin' ||
      path.includes('/admin') ||
      path.includes('/admin/login');

    // normalize to lower-case (most DBs store canonical lower-case emails)
    const normalizedEmail = email.toLowerCase();

    console.debug('[auth.login] attempt', {
      email: normalizedEmail,
      from: req.originalUrl,
      preferClient,
      preferAdmin,
    });

    if (!normalizedEmail || !password) {
      console.debug('[auth.login] missing email or password');
      return res
        .status(400)
        .render('auth/login', {
          title: 'Sign in',
          error: 'Missing credentials',
        });
    }

    if (!adminModel || !clientModel) {
      console.error('[auth.login] adminModel or clientModel missing', {
        adminModel: !!adminModel,
        clientModel: !!clientModel,
      });
      return res
        .status(500)
        .render('auth/login', { title: 'Sign in', error: 'Server error' });
    }

    // Helper to verify a record with bcrypt and set cookie+redirect
    async function verifyAndLogin(record, type) {
      const hash =
        record.password_hash || record.password || record.passwordHash;
      if (!hash) {
        console.error(`[auth.login] ${type} record has no password hash`, {
          record,
        });
        return { ok: false, err: 'Server error' };
      }
      const ok = await bcrypt.compare(password, hash);
      if (!ok) return { ok: false, err: 'Invalid credentials' };

      const payload = {
        id: record.id,
        name: record.name || record.full_name || record.display_name || null,
        email: record.email,
        type:
          (type === 'admin' &&
            (record.role === 'super' ? 'super' : record.role || 'admin')) ||
          (type === 'client' ? 'client' : type),
      };
      const token = jwt.sign(payload, ACCESS_TOKEN_SECRET, {
        expiresIn: Math.floor(TOKEN_MAX_AGE_MS / 1000),
      });
      const cookieOpts = { httpOnly: true, maxAge: TOKEN_MAX_AGE_MS };
      if (process.env.NODE_ENV === 'production') cookieOpts.secure = true;
      res.cookie('jwt', token, cookieOpts);

      return { ok: true, payload };
    }

    // Try the preferred target first if we can tell which one is intended
    if (preferClient && !preferAdmin) {
      // client-first
      try {
        const client =
          (await clientModel.findByEmail(normalizedEmail)) ||
          (await clientModel.findByEmail(email));
        if (client) {
          const result = await verifyAndLogin(client, 'client');
          if (result.ok) return res.redirect('/client/dashboard');
          if (result.err === 'Invalid credentials')
            return res
              .status(401)
              .render('auth/login', {
                title: 'Sign in',
                error: 'Invalid credentials',
              });
        }
      } catch (e) {
        console.error('[auth.login] clientModel.findByEmail error', e);
      }

      // fallback to admin if client not found
      try {
        const admin =
          (await adminModel.findByEmail(normalizedEmail)) ||
          (await adminModel.findByEmail(email));
        if (admin) {
          const result = await verifyAndLogin(admin, 'admin');
          if (result.ok) return res.redirect('/admin/dashboard');
          if (result.err === 'Invalid credentials')
            return res
              .status(401)
              .render('auth/login', {
                title: 'Sign in',
                error: 'Invalid credentials',
              });
        }
      } catch (e) {
        console.error('[auth.login] adminModel.findByEmail error', e);
      }

      return res
        .status(401)
        .render('auth/login', {
          title: 'Sign in',
          error: 'Invalid credentials',
        });
    }

    if (preferAdmin && !preferClient) {
      // admin-first
      try {
        const admin =
          (await adminModel.findByEmail(normalizedEmail)) ||
          (await adminModel.findByEmail(email));
        if (admin) {
          const result = await verifyAndLogin(admin, 'admin');
          if (result.ok) return res.redirect('/admin/dashboard');
          if (result.err === 'Invalid credentials')
            return res
              .status(401)
              .render('auth/login', {
                title: 'Sign in',
                error: 'Invalid credentials',
              });
        }
      } catch (e) {
        console.error('[auth.login] adminModel.findByEmail error', e);
      }

      // fallback to client
      try {
        const client =
          (await clientModel.findByEmail(normalizedEmail)) ||
          (await clientModel.findByEmail(email));
        if (client) {
          const result = await verifyAndLogin(client, 'client');
          if (result.ok) return res.redirect('/client/dashboard');
          if (result.err === 'Invalid credentials')
            return res
              .status(401)
              .render('auth/login', {
                title: 'Sign in',
                error: 'Invalid credentials',
              });
        }
      } catch (e) {
        console.error('[auth.login] clientModel.findByEmail error', e);
      }

      return res
        .status(401)
        .render('auth/login', {
          title: 'Sign in',
          error: 'Invalid credentials',
        });
    }

    // Default: current behaviour (admin first, then client)
    // 1) try admin
    try {
      const admin =
        (await adminModel.findByEmail(normalizedEmail)) ||
        (await adminModel.findByEmail(email));
      if (admin) {
        const result = await verifyAndLogin(admin, 'admin');
        if (result.ok) return res.redirect('/admin/dashboard');
        if (result.err === 'Invalid credentials')
          return res
            .status(401)
            .render('auth/login', {
              title: 'Sign in',
              error: 'Invalid credentials',
            });
      }
    } catch (e) {
      console.error('[auth.login] adminModel.findByEmail error', e);
    }

    // 2) try client
    try {
      const client =
        (await clientModel.findByEmail(normalizedEmail)) ||
        (await clientModel.findByEmail(email));
      if (client) {
        const result = await verifyAndLogin(client, 'client');
        if (result.ok) return res.redirect('/client/dashboard');
        if (result.err === 'Invalid credentials')
          return res
            .status(401)
            .render('auth/login', {
              title: 'Sign in',
              error: 'Invalid credentials',
            });
      }
    } catch (e) {
      console.error('[auth.login] clientModel.findByEmail error', e);
    }

    console.debug('[auth.login] no user found for', normalizedEmail);
    return res
      .status(401)
      .render('auth/login', { title: 'Sign in', error: 'Invalid credentials' });
  } catch (err) {
    console.error('auth.login error', err);
    return res
      .status(500)
      .render('auth/login', { title: 'Sign in', error: 'Login failed' });
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
    try {
      res.clearCookie('jwt');
    } catch {}
    return res.redirect('/');
  }
};

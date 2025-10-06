// middleware/authJwt.js
const jwt = require('jsonwebtoken');

const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET;
if (!ACCESS_TOKEN_SECRET) {
  console.warn('WARNING: ACCESS_TOKEN_SECRET not set; set it in .env');
}

/**
 * checkJWTToken
 * - If a valid JWT is present (cookie or Authorization header), populate:
 *    req.user, res.locals.currentUser, res.locals.loggedin = true
 * - If invalid token, clear cookie and continue (treat as logged out)
 * - Always call next() so routes may choose to require auth explicitly
 */
function checkJWTToken(req, res, next) {
  try {
    const token =
      (req.cookies && req.cookies.jwt) ||
      (req.headers.authorization
        ? String(req.headers.authorization).split(' ')[1]
        : null);

    if (!token) {
      return next();
    }

    jwt.verify(token, ACCESS_TOKEN_SECRET, (err, payload) => {
      if (err) {
        if (req.cookies && req.cookies.jwt) res.clearCookie('jwt');
        return next();
      }
      // minimal payload expected: { id, name, email, type }
      req.user = payload;
      res.locals.currentUser = payload;
      res.locals.loggedin = true;
      return next();
    });
  } catch (err) {
    if (req.cookies && req.cookies.jwt) res.clearCookie('jwt');
    return next();
  }
}

/**
 * requireAuth
 * Generic logged-in check. Redirects to unified login page.
 */
function requireAuth(req, res, next) {
  if (req.user) return next();
  // keep behavior consistent: redirect to login page
  return res.redirect('/login');
}

/**
 * requireClient
 * Allow only users where token.type === 'client'
 */
function requireClient(req, res, next) {
  if (req.user && req.user.type === 'client') return next();
  // optional: set a flash if you still use flash messages; compatible fallback below:
  if (req.session)
    req.session.error =
      'You must be logged in as a client to access that page.';
  return res.redirect('/client/login');
}

/**
 * requireAdmin
 * Allow admin, super, and agent types (matches your session requireAdmin)
 */
function requireAdmin(req, res, next) {
  if (
    req.user &&
    (req.user.type === 'admin' ||
      req.user.type === 'super' ||
      req.user.type === 'agent')
  ) {
    return next();
  }
  if (req.session)
    req.session.error =
      'You must be logged in as an admin to access that page.';
  return res.redirect('/admin/login');
}

/**
 * requireSuper
 * Only allow 'super' (matches your session requireSuper semantics)
 */
function requireSuper(req, res, next) {
  if (req.user && req.user.type === 'super') return next();
  if (req.session) req.session.error = 'Only super admin can access that page';
  // redirect: if logged in send to admin dashboard, else admin login
  if (req.user) return res.redirect('/admin/dashboard');
  return res.redirect('/admin/login');
}

module.exports = {
  checkJWTToken,
  requireAuth,
  requireClient,
  requireAdmin,
  requireSuper,
};

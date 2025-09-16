// middleware/auth.js
// Authentication/authorization helpers for route protection.

exports.requireClient = (req, res, next) => {
  if (req.session && req.session.user && req.session.user.type === 'client') return next();
  req.session.error = 'You must be logged in as a client to access that page.';
  return res.redirect('/client/login');
};

// requireAdmin: allow both normal admins (agents) and super admins.
// Use this for admin routes that agents and super admins may access.
exports.requireAdmin = (req, res, next) => {
  if (req.session && req.session.user && (req.session.user.type === 'admin' || req.session.user.type === 'super' || req.session.user.type === 'agent')) {
    return next();
  }
  req.session.error = 'You must be logged in as an admin to access that page.';
  return res.redirect('/admin/login');
};

// requireSuper: only super admins allowed.
// Use this for sensitive actions (creating other admins, global config).
exports.requireSuper = (req, res, next) => {
  if (req.session && req.session.user && req.session.user.type === 'super') return next();
  req.session.error = 'Only super admin can access that page';
  // redirect to admin dashboard if logged in, otherwise to admin login
  if (req.session && req.session.user) return res.redirect('/admin/dashboard');
  return res.redirect('/admin/login');
};

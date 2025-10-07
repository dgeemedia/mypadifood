// middleware/auth.js
// Authentication/authorization helpers for route protection.

exports.requireClient = (req, res, next) => {
  if (req.session && req.session.user && req.session.user.type === 'client')
    return next();
  req.session.error = 'You must be logged in as a client to access that page.';
  return res.redirect('/client/login');
};

// requireAdmin: allow both normal admins (agents) and super admins.
// Use this for admin routes that agents and super admins may access.
exports.requireAdmin = (req, res, next) => {
  if (
    req.session &&
    req.session.user &&
    (req.session.user.type === 'admin' ||
      req.session.user.type === 'super' ||
      req.session.user.type === 'agent')
  ) {
    return next();
  }
  req.session.error = 'You must be logged in as an admin to access that page.';
  return res.redirect('/admin/login');
};

// requireAdminOrAgent: allow admin, agent, super, and food-specialist roles.
// Use this for Resources page and other places where admins/agents/food specialists may need access.
exports.requireAdminOrAgent = (req, res, next) => {
  if (
    req.session &&
    req.session.user &&
    (
      req.session.user.type === 'admin' ||
      req.session.user.type === 'agent' ||
      req.session.user.type === 'super' ||
      req.session.user.type === 'food_specialist' ||
      req.session.user.type === 'specialist'
    )
  ) {
    return next();
  }

  req.session.error =
    'You must be logged in as an admin, agent, or food specialist to access that page.';

  // If they're logged in but not authorized, send them to admin dashboard,
  // otherwise ask them to sign in.
  if (req.session && req.session.user) return res.redirect('/admin/dashboard');
  return res.redirect('/admin/login');
};

// requireSuper: only super admins allowed.
// Use this for sensitive actions (creating other admins, global config).
exports.requireSuper = (req, res, next) => {
  if (req.session && req.session.user && req.session.user.type === 'super')
    return next();
  req.session.error = 'Only super admin can access that page';
  // redirect to admin dashboard if logged in, otherwise to admin login
  if (req.session && req.session.user) return res.redirect('/admin/dashboard');
  return res.redirect('/admin/login');
};

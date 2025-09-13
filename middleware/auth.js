exports.requireClient = (req, res, next) => {
  if (req.session.user && req.session.user.type === 'client') return next();
  req.session.error = 'You must be logged in as a client to access that page.';
  return res.redirect('/client/login');
};

exports.requireAdmin = (req, res, next) => {
  if (req.session.user && (req.session.user.type === 'admin' || req.session.user.type === 'super')) return next();
  req.session.error = 'You must be logged in as an admin to access that page.';
  return res.redirect('/admin/login');
};
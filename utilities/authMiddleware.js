// utilities/authMiddleware.js
exports.ensureAuth = (req, res, next) => {
  if (req.session && req.session.user) return next();
  // send to login page
  return res.redirect('/auth/login');
};

exports.ensureAdmin = (req, res, next) => {
  if (req.session && req.session.user && req.session.user.role === 'admin') return next();
  return res.status(403).send('Forbidden - admin only');
};

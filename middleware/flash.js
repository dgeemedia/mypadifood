// middleware/flash.js
// Simple flash/messages helper middleware used by EJS templates.
// Exposes:
//   res.locals.currentUser, res.locals.success, res.locals.error, res.locals.title
//   res.locals.messages() -> returns safe HTML string (for <%- messages() %>)
//
// It clears req.session.success and req.session.error so messages are one-time.

function _escapeHtml(str) {
  if (str === undefined || str === null) return '';
  return String(str).replace(/[&<>"']/g, (s) => {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[s];
  });
}

module.exports = function flashMiddleware(req, res, next) {
  try {
    // keep previous behavior: expose current session values to templates
    res.locals.currentUser = req.session && req.session.user ? req.session.user : null;
    res.locals.success = req.session && req.session.success ? req.session.success : null;
    res.locals.error = req.session && req.session.error ? req.session.error : null;
    res.locals.title = res.locals.title || 'MyPadiFood';

    // Optional: expose dev verification link if present in session (one-time)
    if (req.session && req.session.verification_link) {
      res.locals.verification_link = req.session.verification_link;
      // remove from session so it appears only once
      delete req.session.verification_link;
    }

    // messages() helper expected by your EJS files (<%- messages() %>)
    res.locals.messages = function () {
      let html = '';

      if (res.locals.success) {
        html += `<div class="flash flash-success" role="status">${_escapeHtml(res.locals.success)}</div>`;
      }
      if (res.locals.error) {
        html += `<div class="flash flash-error" role="alert">${_escapeHtml(res.locals.error)}</div>`;
      }
      return html;
    };

    // Clear session flash values (one-time)
    if (req.session) {
      delete req.session.success;
      delete req.session.error;
    }
  } catch (e) {
    // don't block requests if flash helper fails
    console.error('flash middleware error', e);
  }

  next();
};

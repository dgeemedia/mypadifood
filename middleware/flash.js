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
  // keep previous behavior: expose current session values to templates
  res.locals.currentUser = req.session.user || null;
  res.locals.success = req.session.success || null;
  res.locals.error = req.session.error || null;
  res.locals.title = res.locals.title || 'MyPadiFood';

  // Optional: expose dev verification link if present in session (one-time)
  if (req.session.verification_link) {
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
  delete req.session.success;
  delete req.session.error;

  next();
};

// middleware/flash.js
// Simple flash/messages helper middleware used by EJS templates.
// Adds req.flash(type, msg) compatibility for code expecting connect-flash.

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
    // provide req.flash(type, msg) convenience if missing
    if (!req.flash || typeof req.flash !== 'function') {
      req.flash = function (type, msg) {
        if (!req.session) return;
        if (type === 'error') req.session.error = msg;
        else if (type === 'success') req.session.success = msg;
        else {
          // generic store for other types
          req.session._custom_flash = req.session._custom_flash || {};
          req.session._custom_flash[type] = msg;
        }
      };
    }

    // expose current session values to templates (one-time)
    res.locals.currentUser =
      req.session && req.session.user ? req.session.user : null;
    res.locals.success =
      req.session && req.session.success ? req.session.success : null;
    res.locals.error =
      req.session && req.session.error ? req.session.error : null;
    res.locals.title = res.locals.title || 'MyPadiFood';

    if (req.session && req.session.verification_link) {
      res.locals.verification_link = req.session.verification_link;
      delete req.session.verification_link;
    }

    // build unified `flash` object (arrays) for templates that expect flash.success/flash.error
    res.locals.flash = {};
    if (res.locals.success) {
      res.locals.flash.success = Array.isArray(res.locals.success)
        ? res.locals.success
        : [res.locals.success];
    }
    if (res.locals.error) {
      res.locals.flash.error = Array.isArray(res.locals.error)
        ? res.locals.error
        : [res.locals.error];
    }

    // include any custom flash stored in session (already stored as single values)
    if (req.session && req.session._custom_flash) {
      for (const k of Object.keys(req.session._custom_flash)) {
        const v = req.session._custom_flash[k];
        res.locals.flash[k] = Array.isArray(v) ? v : [v];
      }
    }

    // messages() helper expected by EJS files (<%- messages() %>)
    res.locals.messages = function () {
      let html = '';
      if (res.locals.success) {
        html += `<div class="flash flash-success" role="status">${_escapeHtml(res.locals.success)}</div>`;
      }
      if (res.locals.error) {
        html += `<div class="flash flash-error" role="alert">${_escapeHtml(res.locals.error)}</div>`;
      }
      // include custom flash types if any
      if (req.session && req.session._custom_flash) {
        for (const t in req.session._custom_flash) {
          html += `<div class="flash flash-${_escapeHtml(t)}" role="status">${_escapeHtml(req.session._custom_flash[t])}</div>`;
        }
      }
      return html;
    };

    // Clear session flash values (one-time)
    if (req.session) {
      delete req.session.success;
      delete req.session.error;
      delete req.session._custom_flash;
    }
  } catch (e) {
    console.error('flash middleware error', e);
  }
  next();
};

// middleware/flash.js
function _escapeHtml(str) {
  if (str === undefined || str === null) return '';
  return String(str).replace(/[&<>"']/g, (s) => {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s];
  });
}

module.exports = function flashMiddleware(req, res, next) {
  try {
    // ensure session exists
    req.session = req.session || {};

    // normalize free-form legacy fields into structured session.flash
    req.session.flash = req.session.flash || {};

    if (req.session.success) {
      req.session.flash.success = req.session.flash.success || [];
      req.session.flash.success.push(String(req.session.success));
      delete req.session.success;
    }
    if (req.session.error) {
      req.session.flash.error = req.session.flash.error || [];
      req.session.flash.error.push(String(req.session.error));
      delete req.session.error;
    }

    // Copy flash to locals (one-time)
    const copied = {};
    Object.keys(req.session.flash).forEach((k) => {
      const v = req.session.flash[k];
      copied[k] = Array.isArray(v) ? v.slice() : [String(v)];
    });

    res.locals.flash = copied;
    res.locals.success = (copied.success && copied.success[0]) || null;
    res.locals.error = (copied.error && copied.error[0]) || null;
    res.locals.title = res.locals.title || 'MyPadiFood';

    // helper used by templates (<%- messages() %>)
    res.locals.messages = function () {
      let html = '';
      if (res.locals.flash) {
        if (res.locals.flash.success && res.locals.flash.success.length) {
          for (const m of res.locals.flash.success) {
            html += `<div class="flash flash-success" role="status">${_escapeHtml(m)}</div>`;
          }
        }
        if (res.locals.flash.error && res.locals.flash.error.length) {
          for (const m of res.locals.flash.error) {
            html += `<div class="flash flash-error" role="alert">${_escapeHtml(m)}</div>`;
          }
        }
        // other types
        Object.keys(res.locals.flash).forEach((type) => {
          if (type === 'success' || type === 'error') return;
          const arr = res.locals.flash[type];
          if (Array.isArray(arr) && arr.length) {
            for (const m of arr) {
              html += `<div class="flash flash-${_escapeHtml(type)}">${_escapeHtml(m)}</div>`;
            }
          }
        });
      }
      return html;
    };

    // Clear session flash so messages are one-time (they live in res.locals now)
    delete req.session.flash;

    // req.flash API: setter/getter
    req.flash = function (type, msg) {
      if (!type) return null;
      // getter (from the copy we made)
      if (typeof msg === 'undefined') {
        const arr = res.locals.flash && res.locals.flash[type] ? res.locals.flash[type].slice() : [];
        // consumed already in this request (res.locals copy), don't modify session here
        return arr;
      }
      // setter: create session.flash so message survives redirect to next page
      req.session.flash = req.session.flash || {};
      req.session.flash[type] = req.session.flash[type] || [];
      req.session.flash[type].push(String(msg));
      return req.session.flash[type];
    };

    // also expose the currentUser as you previously did
    res.locals.currentUser = req.session && req.session.user ? req.session.user : null;
  } catch (e) {
    console.error('flash middleware error', e);
  }
  next();
};

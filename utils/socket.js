// utils/socket.js
let ioInstance = null;

/**
 * Initialize the socket util with an existing socket.io Server instance.
 * Call this once from server.js after creating the Server:
 *   const io = new Server(server);
 *   require('./utils/socket').init(io);
 */
function init(io) {
  ioInstance = io;
  return ioInstance;
}

/**
 * Return the initialized io instance (or null if not yet initialized).
 * Controllers and other modules can call this to emit events:
 *   const io = require('../utils/socket').get();
 *   if (io) io.to(`order_${orderId}`).emit('new_message', msg);
 */
function get() {
  return ioInstance;
}

/**
 * Optional helper: convenience emit that checks io presence.
 * Usage: require('./utils/socket').emitSafe('order_123', 'new_message', payload)
 */
function emitSafe(roomOrNamespace, event, payload) {
  if (!ioInstance) return false;
  try {
    ioInstance.to(roomOrNamespace).emit(event, payload);
    return true;
  } catch (e) {
    console.error("emitSafe error", e);
    return false;
  }
}

module.exports = { init, get, emitSafe };

// controllers/chatController.js
const models = require('../models');
const messageModel = models.message;
const orderModel = models.order;
const vendorModel = models.vendor;
const socketUtil = require('../utils/socket');

/**
 * Authorize that current session user may access this order.
 * Allowed: client who owns order, assigned_admin, or super admin.
 * Throws an Error if not allowed.
 */
async function authorizeAccess(req, orderId) {
  if (!req || !req.session || !req.session.user) {
    const e = new Error('Not authenticated');
    e.status = 401;
    throw e;
  }

  const user = req.session.user;
  const order = await orderModel.findById(orderId);
  if (!order) {
    const e = new Error('Order not found');
    e.status = 404;
    throw e;
  }

  // order should include client_id and assigned_admin fields
  const isClient = user.type === 'client' && String(user.id) === String(order.client_id);
  const isAssignedAdmin =
    (user.type === 'admin' || user.type === 'agent') &&
    order.assigned_admin &&
    String(user.id) === String(order.assigned_admin);
  const isSuper = user.type === 'super';

  if (!(isClient || isAssignedAdmin || isSuper)) {
    const e = new Error('Not authorized to access this order');
    e.status = 403;
    throw e;
  }

  // authorized; return order for convenience
  return order;
}

exports.postMessage = async (req, res) => {
  try {
    const { orderId, message } = req.body;
    if (!orderId || !message) return res.status(400).json({ ok: false, message: 'Missing orderId or message' });

    // Authorization: ensure user can access this order
    const order = await authorizeAccess(req, orderId);

    // identify sender
    let senderType = 'bot';
    let senderId = null;
    if (req.session && req.session.user) {
      if (req.session.user.type === 'client') { senderType = 'client'; senderId = req.session.user.id; }
      else if (req.session.user.type === 'admin' || req.session.user.type === 'super' || req.session.user.type === 'agent') { senderType = 'admin'; senderId = req.session.user.id; }
    }

    // get last message to decide auto bot reply
    // We ask for 1 message and then pick the last element (safe if function returns ascending)
    const previous = await messageModel.getMessagesByOrder(orderId, 1);
    let lastMsg = null;
    if (Array.isArray(previous) && previous.length > 0) lastMsg = previous[previous.length - 1];

    // create the message
    const created = await messageModel.createMessage({
      orderId,
      senderType,
      senderId,
      message,
      metadata: {}
    });

    // Emit created message: to order room AND to admin dashboards (admins room)
    const io = socketUtil.get();
    if (io) {
      io.to(`order_${orderId}`).emit('new_message', created);
      io.to('admins').emit('order_message', { orderId, message: created });
    }

    // If client replied and previous message was a bot prompt -> auto bot reply
    if (senderType === 'client' && lastMsg && lastMsg.sender_type === 'bot') {
      // include vendor name if available (order.vendor_id)
      let vendorName = null;
      try {
        if (order.vendor_id) {
          const vendor = await vendorModel.findById(order.vendor_id);
          vendorName = vendor ? vendor.name : null;
        }
      } catch (e) {
        console.error('Vendor lookup failed', e);
      }

      const botText = `Kindly be patient as your request is being processed by an agent${vendorName ? ' of ' + vendorName : ''}.`;
      const botCreated = await messageModel.createMessage({
        orderId,
        senderType: 'bot',
        senderId: null,
        message: botText,
        metadata: { vendorName: vendorName || null }
      });

      if (io) {
        io.to(`order_${orderId}`).emit('new_message', botCreated);
        io.to('admins').emit('order_message', { orderId, message: botCreated });
      }
    }

    return res.json({ ok: true, message: created });
  } catch (err) {
    console.error('postMessage error', err);
    const status = err.status || 500;
    return res.status(status).json({ ok: false, message: err.message || 'Server error' });
  }
};

exports.getMessages = async (req, res) => {
  try {
    const { orderId } = req.params;
    if (!orderId) return res.status(400).json({ ok: false, message: 'Missing orderId' });

    await authorizeAccess(req, orderId);

    const rows = await messageModel.getMessagesByOrder(orderId, 500);

    // mark read flags based on session type
    if (req.session && req.session.user && req.session.user.type === 'admin') {
      await messageModel.markReadByAdmin(orderId);
    } else if (req.session && req.session.user && req.session.user.type === 'client') {
      await messageModel.markReadByClient(orderId);
    }

    return res.json({ ok: true, messages: rows });
  } catch (err) {
    console.error('getMessages', err);
    const status = err.status || 500;
    return res.status(status).json({ ok: false, message: err.message || 'Server error' });
  }
};

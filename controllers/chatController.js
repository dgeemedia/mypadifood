// controllers/chatController.js
const models = require("../models");
const messageModel = models.message;
const orderModel = models.order;
const vendorModel = models.vendor;
const socketUtil = require("../utils/socket");

/**
 * Authorize that current session user may access this order.
 * Allowed: client who owns order, assigned_admin, or super admin.
 * Throws an Error if not allowed.
 */
async function authorizeAccess(req, orderId) {
  if (!req || !req.session || !req.session.user) {
    const e = new Error("Not authenticated");
    e.status = 401;
    throw e;
  }

  const user = req.session.user;
  const order = await orderModel.findById(orderId);
  if (!order) {
    const e = new Error("Order not found");
    e.status = 404;
    throw e;
  }

  // order should include client_id and assigned_admin fields
  const isClient = user.type === "client" && String(user.id) === String(order.client_id);
  const isAssignedAdmin =
    (user.type === "admin" || user.type === "agent") &&
    order.assigned_admin &&
    String(user.id) === String(order.assigned_admin);
  const isSuper = user.type === "super";

  if (!(isClient || isAssignedAdmin || isSuper)) {
    const e = new Error("Not authorized to access this order");
    e.status = 403;
    throw e;
  }

  // authorized; return order for convenience
  return order;
}

exports.postMessage = async (req, res) => {
  try {
    const { orderId, message } = req.body;
    if (!orderId || !message)
      return res.status(400).json({ ok: false, message: "Missing orderId or message" });

    // Authorization: ensure user can access this order
    const order = await authorizeAccess(req, orderId);

    // identify sender
    let senderType = "bot";
    let senderId = null;
    if (req.session && req.session.user) {
      if (req.session.user.type === "client") {
        senderType = "client";
        senderId = req.session.user.id;
      } else if (
        req.session.user.type === "admin" ||
        req.session.user.type === "super" ||
        req.session.user.type === "agent"
      ) {
        senderType = "admin";
        senderId = req.session.user.id;
      }
    }

    // get last message to decide auto bot reply
    const previous = await messageModel.getMessagesByOrder(orderId, 1);
    let lastMsg = null;
    if (Array.isArray(previous) && previous.length > 0) lastMsg = previous[previous.length - 1];

    // create the message (the real incoming message)
    const created = await messageModel.createMessage({
      orderId,
      senderType,
      senderId,
      message,
      metadata: {},
    });

    // --- attach display_name to the created message before emitting ---
    // prefer session / order values for client; lookup admin name for admin; 'Support' for bot
    let displayName = "";
    if (senderType === "client") {
      displayName =
        req.session && req.session.user && req.session.user.name
          ? req.session.user.name
          : order && order.client_name
            ? order.client_name
            : "Client";
    } else if (senderType === "admin") {
      try {
        const adminModel = require("../models").admin;
        const adminRow = senderId ? await adminModel.findById(senderId) : null;
        displayName = adminRow ? adminRow.name : senderId ? `Admin ${senderId}` : "Admin";
      } catch (e) {
        displayName = senderId ? `Admin ${senderId}` : "Admin";
      }
    } else if (senderType === "bot") {
      displayName = "Support";
    } else {
      displayName = senderType || "Unknown";
    }

    const createdWithName = Object.assign({}, created, {
      display_name: displayName,
    });

    // Emit created message: to order room AND to admin dashboards (admins room)
    const io = socketUtil.get();
    if (io) {
      io.to(`order_${orderId}`).emit("new_message", createdWithName);
      io.to("admins").emit("order_message", {
        orderId,
        message: createdWithName,
      });
    }

    // If client replied and previous message was a bot prompt -> intelligent bot reply/ack
    if (senderType === "client" && lastMsg && lastMsg.sender_type === "bot") {
      // vendor name lookup (if available)
      let vendorName = null;
      try {
        if (order.vendor_id) {
          const vendor = await vendorModel.findById(order.vendor_id);
          vendorName = vendor ? vendor.name : null;
        }
      } catch (e) {
        console.error("Vendor lookup failed", e);
      }

      const botPromptText = lastMsg && lastMsg.message ? String(lastMsg.message).toLowerCase() : "";
      const replyText = (typeof message === "string" ? message.trim() : "").toLowerCase();

      // Heuristic: did bot ask a yes/no or modify question?
      if (
        botPromptText.includes("would you like") ||
        botPromptText.includes("select yes or no") ||
        botPromptText.includes("modify this request") ||
        botPromptText.includes("would you like to modify")
      ) {
        // Treat "no" specially: acknowledge and notify admins
        if (/^no\b/.test(replyText) || replyText === "n" || replyText === "nope") {
          const ackText = `Thanks — we've noted your response. An agent will contact you if needed.`;
          const botCreated = await messageModel.createMessage({
            orderId,
            senderType: "bot",
            senderId: null,
            message: ackText,
            metadata: { vendorName: vendorName || null },
          });

          // attach display_name and emit
          const botCreatedWithName = Object.assign({}, botCreated, {
            display_name: "Support",
          });

          // Create a notification for admins so they are aware client said "no"
          if (models.notification && typeof models.notification.createNotification === "function") {
            try {
              const notif = await models.notification.createNotification({
                order_id: orderId,
                type: "bot_response",
                payload: {
                  client_id: req.session.user.id,
                  client_name: req.session.user.name || order.client_name,
                  client_phone: req.session.user.phone || order.client_phone,
                  response: "no",
                  order_summary: message,
                },
              });
              if (io) io.to("admins").emit("new_notification", notif);
            } catch (e) {
              console.error("Failed to create bot-response notification (non-fatal)", e);
            }
          }

          if (io) {
            io.to(`order_${orderId}`).emit("new_message", botCreatedWithName);
            io.to("admins").emit("order_message", {
              orderId,
              message: botCreatedWithName,
            });
          }
        } else {
          // Any other reply (including 'yes') means user wants modification -> notify admins
          const ackText = `Thanks — an agent will handle your modification request shortly.`;
          const botCreated = await messageModel.createMessage({
            orderId,
            senderType: "bot",
            senderId: null,
            message: ackText,
            metadata: { vendorName: vendorName || null },
          });

          const botCreatedWithName = Object.assign({}, botCreated, {
            display_name: "Support",
          });

          if (models.notification && typeof models.notification.createNotification === "function") {
            try {
              const notif = await models.notification.createNotification({
                order_id: orderId,
                type: "menu_update",
                payload: {
                  client_id: req.session.user.id,
                  client_name: req.session.user.name || order.client_name,
                  client_phone: req.session.user.phone || order.client_phone,
                  order_summary: message,
                },
              });
              if (io) io.to("admins").emit("new_notification", notif);
            } catch (e) {
              console.error("Failed to create menu_update notification (non-fatal)", e);
            }
          }

          if (io) {
            io.to(`order_${orderId}`).emit("new_message", botCreatedWithName);
            io.to("admins").emit("order_message", {
              orderId,
              message: botCreatedWithName,
            });
          }
        }
      } else {
        // Fallback: polite generic acknowledgement (no hanging prompts)
        const botText = `Kindly be patient as your request is being processed by an agent${vendorName ? " of " + vendorName : ""}.`;
        const botCreated = await messageModel.createMessage({
          orderId,
          senderType: "bot",
          senderId: null,
          message: botText,
          metadata: { vendorName: vendorName || null },
        });

        const botCreatedWithName = Object.assign({}, botCreated, {
          display_name: "Support",
        });

        if (io) {
          io.to(`order_${orderId}`).emit("new_message", botCreatedWithName);
          io.to("admins").emit("order_message", {
            orderId,
            message: botCreatedWithName,
          });
        }
      }
    }

    // return created message to the HTTP caller (also includes display_name)
    return res.json({ ok: true, message: createdWithName });
  } catch (err) {
    console.error("postMessage error", err);
    const status = err.status || 500;
    return res.status(status).json({ ok: false, message: err.message || "Server error" });
  }
};

exports.getMessages = async (req, res) => {
  try {
    const { orderId } = req.params;
    if (!orderId) return res.status(400).json({ ok: false, message: "Missing orderId" });

    await authorizeAccess(req, orderId);

    const rows = await messageModel.getMessagesByOrder(orderId, 500);

    // mark read flags based on session type
    if (req.session && req.session.user && req.session.user.type === "admin") {
      await messageModel.markReadByAdmin(orderId);
    } else if (req.session && req.session.user && req.session.user.type === "client") {
      await messageModel.markReadByClient(orderId);
    }

    return res.json({ ok: true, messages: rows });
  } catch (err) {
    console.error("getMessages", err);
    const status = err.status || 500;
    return res.status(status).json({ ok: false, message: err.message || "Server error" });
  }
};

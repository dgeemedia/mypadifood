// controllers/reviewController.js
const models = require('../models');
const reviewModel = models.review;
const orderModel = models.order; // used to validate order ownership maybe
const vendorModel = models.vendor;

function buildTree(rows) {
  const byId = {};
  rows.forEach((r) => {
    byId[r.id] = Object.assign({}, r, { replies: [] });
  });
  const roots = [];
  rows.forEach((r) => {
    if (r.parent_id && byId[r.parent_id]) {
      byId[r.parent_id].replies.push(byId[r.id]);
    } else {
      roots.push(byId[r.id]);
    }
  });
  return roots;
}

exports.postReview = async (req, res) => {
  try {
    const clientId = req.session.user && req.session.user.id;
    if (!clientId)
      return res.status(403).json({ ok: false, error: 'Not authenticated' });

    const { vendorId, orderId, rating, comment } = req.body;
    if (!vendorId)
      return res.status(400).json({ ok: false, error: 'vendorId required' });

    // optional: ensure rating is integer 1-5
    const r = parseInt(rating, 10);
    if (isNaN(r) || r < 1 || r > 5)
      return res.status(400).json({ ok: false, error: 'rating must be 1-5' });

    // optional: verify order belongs to client and refers to vendor (if orderId provided)
    if (orderId) {
      const order = await orderModel.findById(orderId);
      if (
        !order ||
        order.client_id !== clientId ||
        order.vendor_id !== vendorId
      ) {
        return res.status(400).json({ ok: false, error: 'Invalid order' });
      }
    }

    const created = await reviewModel.createReview({
      vendorId,
      clientId,
      orderId: orderId || null,
      rating: r,
      comment: comment || null,
      parentId: null,
    });

    return res.json({ ok: true, review: created });
  } catch (e) {
    console.error('postReview error', e);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
};

exports.postReplyByClient = async (req, res) => {
  try {
    const clientId = req.session.user && req.session.user.id;
    if (!clientId)
      return res.status(403).json({ ok: false, error: 'Not authenticated' });

    const parentId = req.params.id;
    const { comment } = req.body;
    if (!comment)
      return res.status(400).json({ ok: false, error: 'comment required' });

    // Could validate parent exists and belongs to vendor etc.
    // For simplicity: create reply with same vendor id as parent
    const parentRows =
      await reviewModel.getReviewsByVendor(/* hack: we'll fetch parent via DB */);
    // simpler: directly insert parent_id provided, rely on FK to validate
    const created = await reviewModel.createReview({
      vendorId: req.body.vendorId, // client should pass vendorId
      clientId,
      parentId,
      comment,
    });

    return res.json({ ok: true, reply: created });
  } catch (e) {
    console.error('postReplyByClient', e);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
};

exports.postReplyByAdmin = async (req, res) => {
  try {
    const admin = req.session.admin;
    if (!admin) return res.status(403).json({ ok: false, error: 'Admin only' });

    const parentId = req.params.id;
    const { vendorId, comment } = req.body;
    if (!comment)
      return res.status(400).json({ ok: false, error: 'comment required' });

    const created = await reviewModel.createReview({
      vendorId,
      adminId: admin.id,
      parentId,
      comment,
    });

    return res.json({ ok: true, reply: created });
  } catch (e) {
    console.error('postReplyByAdmin', e);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
};

exports.getReviewsForVendor = async (vendorId) => {
  const rows = await reviewModel.getReviewsByVendor(vendorId);
  return buildTree(rows);
};

// controllers/adminTestimonialsController.js
const testimonialModel = require('../models/testimonialModel');

exports.listPending = async (req, res) => {
  try {
    const pending = await testimonialModel.getPending(200);
    // render the admin view; layout is handled by your app (no admin-header includes here)
    res.render('admin/testimonials-pending', {
      testimonials: pending,
      currentUser: res.locals.currentUser || null,
    });
  } catch (err) {
    console.error('Could not load pending testimonials', err);
    if (req.flash) req.flash('error', 'Could not load pending testimonials');
    return res.redirect('/admin/dashboard');
  }
};

exports.approve = async (req, res) => {
  try {
    const id = req.params.id;
    await testimonialModel.approveById(id);
    if (req.flash) req.flash('success', 'Testimonial approved');
    return res.redirect('/admin/testimonials/pending');
  } catch (err) {
    console.error('Approve testimonial error', err);
    if (req.flash) req.flash('error', 'Could not approve testimonial');
    return res.redirect('/admin/testimonials/pending');
  }
};

exports.reject = async (req, res) => {
  try {
    const id = req.params.id;
    await testimonialModel.deleteById(id);
    if (req.flash) req.flash('success', 'Testimonial rejected and removed');
    return res.redirect('/admin/testimonials/pending');
  } catch (err) {
    console.error('Reject testimonial error', err);
    if (req.flash) req.flash('error', 'Could not reject testimonial');
    return res.redirect('/admin/testimonials/pending');
  }
};

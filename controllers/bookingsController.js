const Bookings = require('../models/bookingModel');
const sendAdminEmail = require('../utilities/smsEmail');

exports.create = async (req, res) => {
  try {
    const user = req.session.user || { name: 'guest' };
    const { vendor_id, quantity = 1, booking_date, amount = 0 } = req.body;
    const booking = await Bookings.create({ customer_id: user.id || null, vendor_id, amount, quantity, status: 'pending', booking_date });
    // create a whatsapp prefilled url and email admin
    await sendAdminEmail('New booking request', `Booking for vendor ${vendor_id} by ${user.name} on ${booking_date}`);
    res.json({ ok: true, booking });
  } catch (err) {
    console.error(err);
    res.status(500).send('server error');
  }
};

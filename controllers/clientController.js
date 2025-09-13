// controllers/clientController.js
const { pool } = require('../database/database');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { sendMail } = require('../utils/mailer');

const SALT_ROUNDS = 10;
const VERIFICATION_TOKEN_TTL_HOURS = 48; // token validity

// show registration form
exports.showRegister = (req, res) => {
  const statesLGAs = require('../locations/Nigeria-State-Lga.json');
  res.render('client-register', { statesLGAs });
};

// handle registration (creates client, creates verification token, emails user)
exports.register = async (req, res) => {
  const {
    full_name, email, phone, state, lga, address, password,
    latitude, longitude, location_source
  } = req.body;

  try {
    // hash password
    const hash = await bcrypt.hash(password, SALT_ROUNDS);

    // insert client
    const insertSql = `
      INSERT INTO clients (
        full_name,email,phone,state,lga,address,password_hash,verified,wallet_balance,latitude,longitude,location_source
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,false,0,$8,$9,$10)
      RETURNING id;
    `;
    const insertRes = await pool.query(insertSql, [
      full_name, email, phone, state, lga, address,
      hash, latitude || null, longitude || null, location_source || 'manual'
    ]);
    const clientId = insertRes.rows[0].id;

    // create verification token
    const token = uuidv4();
    const expiresAt = new Date(Date.now() + VERIFICATION_TOKEN_TTL_HOURS * 3600 * 1000); // TTL hours
    await pool.query(
      'INSERT INTO verification_tokens (token, client_id, expires_at) VALUES ($1,$2,$3)',
      [token, clientId, expiresAt]
    );

    // send verification email
    const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
    const verifyLink = `${baseUrl}/client/verify?token=${token}`;

    const subject = 'Verify your MyPadiFood account';
    const html = `
      <p>Hi ${full_name || 'there'},</p>
      <p>Thanks for registering at MyPadiFood. Please verify your email by clicking the link below:</p>
      <p><a href="${verifyLink}">Verify my email</a></p>
      <p>This link will expire in ${VERIFICATION_TOKEN_TTL_HOURS} hours.</p>
      <p>If you did not register, please ignore this message.</p>
    `;
    const text = `Verify your account: ${verifyLink}`;

    try {
      await sendMail({ to: email, subject, html, text });
      req.session.success = 'Registration successful. A verification email has been sent to your email address.';
    } catch (mailErr) {
      console.error('Error sending verification email:', mailErr);
      // still create account but notify admin / user
      req.session.success = 'Registration created. We could not send verification email — contact support.';
    }

    return res.redirect('/client/login');
  } catch (err) {
    console.error('Error in client register:', err);
    req.session.error = 'Error registering client; email may already exist.';
    return res.redirect('/client/register');
  }
};

// verify email handler — consumes token and marks client verified
exports.verifyEmail = async (req, res) => {
  const { token } = req.query;
  if (!token) {
    req.session.error = 'Invalid verification link.';
    return res.redirect('/');
  }

  try {
    // find token and ensure not expired
    const tokenRes = await pool.query(
      'SELECT token, client_id, expires_at FROM verification_tokens WHERE token=$1',
      [token]
    );
    if (!tokenRes.rows.length) {
      req.session.error = 'Invalid or expired verification link.';
      return res.redirect('/');
    }
    const row = tokenRes.rows[0];
    if (row.expires_at && new Date(row.expires_at) < new Date()) {
      // expired
      await pool.query('DELETE FROM verification_tokens WHERE token=$1', [token]);
      req.session.error = 'Verification link expired. Please register again or contact support.';
      return res.redirect('/');
    }

    // mark client verified
    await pool.query('UPDATE clients SET verified = true WHERE id=$1', [row.client_id]);
    // delete token
    await pool.query('DELETE FROM verification_tokens WHERE token=$1', [token]);

    req.session.success = 'Email verified successfully. You can now log in.';
    return res.redirect('/client/login');
  } catch (err) {
    console.error('Error verifying email:', err);
    req.session.error = 'Verification failed due to server error.';
    return res.redirect('/');
  }
};

// show login page
exports.showLogin = (req, res) => {
  res.render('login', { userType: 'client' });
};

// handle login
exports.login = async (req, res) => {
  const { email, password } = req.body;
  try {
    const { rows } = await pool.query('SELECT * FROM clients WHERE email=$1', [email]);
    if (!rows.length) {
      req.session.error = 'Invalid credentials';
      return res.redirect('/client/login');
    }
    const user = rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      req.session.error = 'Invalid credentials';
      return res.redirect('/client/login');
    }
    if (!user.verified) {
      // If user not verified, create a fresh verification token and resend email (optional)
      // We'll inform the user and attempt to re-send token
      const token = uuidv4();
      const expiresAt = new Date(Date.now() + VERIFICATION_TOKEN_TTL_HOURS * 3600 * 1000);
      await pool.query('INSERT INTO verification_tokens (token, client_id, expires_at) VALUES ($1,$2,$3)', [token, user.id, expiresAt]);
      const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
      const verifyLink = `${baseUrl}/client/verify?token=${token}`;
      const subject = 'Verify your MyPadiFood account (reminder)';
      const html = `<p>Please verify your email by clicking <a href="${verifyLink}">this link</a>. It expires in ${VERIFICATION_TOKEN_TTL_HOURS} hours.</p>`;
      try { await sendMail({ to: user.email, subject, html, text: verifyLink }); }
      catch (e) { console.error('Error sending reminder verification email:', e); }
      req.session.error = 'Email not verified. A verification link was sent to your email.';
      return res.redirect('/client/login');
    }

    // store minimal user info in session
    req.session.user = { id: user.id, type: 'client', name: user.full_name, email: user.email };
    req.session.success = `Welcome back, ${user.full_name}`;
    return res.redirect('/client/dashboard');
  } catch (err) {
    console.error('Error in client login:', err);
    req.session.error = 'Login failed';
    return res.redirect('/client/login');
  }
};

// logout - destroys session and redirects to home
exports.logout = (req, res) => {
  req.session.destroy(err => {
    if (err) console.error('Logout error', err);
    res.clearCookie('connect.sid');
    res.redirect('/');
  });
};

// client dashboard: list local vendors and their orders
exports.dashboard = async (req, res) => {
  try {
    const clientId = req.session.user.id;
    const clientRes = await pool.query('SELECT state, lga FROM clients WHERE id=$1', [clientId]);
    const client = clientRes.rows[0];

    // vendors in client's locality
    const vendorsRes = await pool.query(
      'SELECT id,name,food_item,base_price,address FROM vendors WHERE status=$1 AND state=$2 AND lga=$3',
      ['approved', client.state, client.lga]
    );

    // fetch client's orders with vendor names (LEFT JOIN)
    const ordersRes = await pool.query(
      `SELECT o.*, v.name AS vendor_name
       FROM orders o
       LEFT JOIN vendors v ON o.vendor_id = v.id
       WHERE o.client_id=$1
       ORDER BY o.created_at DESC`,
      [clientId]
    );

    res.render('client-dashboard', { vendors: vendorsRes.rows, orders: ordersRes.rows });
  } catch (err) {
    console.error('Error loading client dashboard:', err);
    req.session.error = 'Error loading dashboard';
    res.redirect('/');
  }
};

// book a vendor
exports.bookVendor = async (req, res) => {
  try {
    const clientId = req.session.user.id;
    const { vendorId, item, payment_method } = req.body;
    // get vendor price
    const vendorRes = await pool.query('SELECT base_price FROM vendors WHERE id=$1', [vendorId]);
    const price = vendorRes.rows[0] ? vendorRes.rows[0].base_price : 0;
    // create order
    await pool.query(
      `INSERT INTO orders (client_id, vendor_id, item, status, payment_method, total_amount)
       VALUES ($1,$2,$3,'pending',$4,$5)`,
      [clientId, vendorId, item, payment_method, price]
    );
    req.session.success = 'Booking request created. An admin will contact you shortly.';
    res.redirect('/client/dashboard');
  } catch (err) {
    console.error('Error creating booking:', err);
    req.session.error = 'Error creating booking';
    res.redirect('/client/dashboard');
  }
};

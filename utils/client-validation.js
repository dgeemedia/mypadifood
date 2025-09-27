// utils/client-validation.js
const { body, validationResult } = require('express-validator');
const models = require('../models'); // expects models/index.js exporting client
const clientModel = models.client;

const registrationRules = () => {
  return [
    body('full_name')
      .trim()
      .notEmpty()
      .withMessage('Full name is required.')
      .isLength({ min: 2 }).withMessage('Full name must be at least 2 characters.'),

    body('email')
      .trim()
      .notEmpty()
      .withMessage('Email is required.')
      .isEmail().withMessage('Please provide a valid email address.')
      .normalizeEmail()
      .custom(async (value) => {
        const existing = await clientModel.findByEmail(value);
        if (existing) {
          throw new Error('Email already registered. Please log in or use a different email.');
        }
        return true;
      }),

    body('phone')
      .trim()
      .notEmpty()
      .withMessage('Phone number is required.')
      .isLength({ min: 6 }).withMessage('Phone number looks too short.'),

    body('state')
      .optional({ checkFalsy: true })
      .trim(),

    body('lga')
      .optional({ checkFalsy: true })
      .trim(),

    body('address')
      .trim()
      .notEmpty()
      .withMessage('Address is required.'),

    // password: 8+ chars, at least 1 lowercase, 1 uppercase, 1 number, 1 symbol
    body('password')
      .notEmpty()
      .withMessage('Password is required.')
      .isStrongPassword({
        minLength: 8,
        minLowercase: 1,
        minUppercase: 1,
        minNumbers: 1,
        minSymbols: 1
      })
      .withMessage('Password must be at least 8 characters and include uppercase, lowercase, number and symbol.')
  ];
};

/**
 * If there are validation errors:
 *  - store submitted form values in req.session.form_data (so register page can re-populate)
 *  - store errors in req.session.form_errors (array of { msg, param, ... })
 *  - redirect to /client/register
 *
 * Otherwise call next()
 */
const checkRegData = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    // Preserve submitted values (but NEVER store raw password in session)
    const { full_name, email, phone, state, lga, address, latitude, longitude, location_source } = req.body;
    req.session.form_data = {
      full_name: full_name || '',
      email: email || '',
      phone: phone || '',
      state: state || '',
      lga: lga || '',
      address: address || '',
      latitude: latitude || '',
      longitude: longitude || '',
      location_source: location_source || 'manual'
    };

    // Store only error objects (array)
    req.session.form_errors = errors.array();

    // Redirect back to registration page (showRegister should read session fields)
    return res.redirect('/client/register');
  }
  return next();
};

module.exports = { registrationRules, checkRegData };

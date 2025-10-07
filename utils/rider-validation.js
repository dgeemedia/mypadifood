// utils/rider-validation.js
const { body, validationResult } = require('express-validator');

const registrationRules = () => {
  return [
    body('full_name').trim().notEmpty().withMessage('Full name is required.').isLength({ min: 2 }).withMessage('Full name must be at least 2 characters.'),
    body('email').trim().notEmpty().withMessage('Email is required.').isEmail().withMessage('Please provide a valid email address.').normalizeEmail(),
    body('phone').trim().notEmpty().withMessage('Phone is required.').isLength({ min: 6 }).withMessage('Phone looks too short.'),
    body('state').trim().notEmpty().withMessage('State is required.'),
    body('lga').trim().notEmpty().withMessage('LGA is required.'),
    body('address').trim().notEmpty().withMessage('Address is required.').isLength({ min: 5 }).withMessage('Address looks too short.'),
    body('vehicle_type').trim().notEmpty().withMessage('Vehicle type is required.'),
    // vehicle_number is required only for car or motorcycle
    body('vehicle_number').custom((val, { req }) => {
      const vt = (req.body.vehicle_type || '').toLowerCase();
      if (vt === 'bicycle') {
        // ok even if empty
        return true;
      }
      if (!val || String(val).trim() === '') {
        throw new Error('Vehicle number is required for motorcycles and cars.');
      }
      return true;
    }),
    body('bank_name').trim().notEmpty().withMessage('Bank name is required.'),
    body('account_number').trim().notEmpty().withMessage('Account number is required.'),
    body('id_type').trim().notEmpty().withMessage('ID type is required.'),
    body('id_number').trim().notEmpty().withMessage('ID number is required.'),
    body('base_fee').optional({ checkFalsy: true }).isFloat({ min: 0 }).withMessage('Base fee must be a positive number.')
    // password validation removed
  ];
};

const checkRegData = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const {
      full_name, email, phone, state, lga, address, vehicle_type, vehicle_number, bank_name, account_number,
      id_type, id_number, next_of_kin, base_fee, latitude, longitude, location_source
    } = req.body;

    req.session.form_data = {
      full_name: full_name || '',
      email: email || '',
      phone: phone || '',
      state: state || '',
      lga: lga || '',
      address: address || '',
      vehicle_type: vehicle_type || '',
      vehicle_number: vehicle_number || '',
      bank_name: bank_name || '',
      account_number: account_number || '',
      id_type: id_type || '',
      id_number: id_number || '',
      next_of_kin: next_of_kin || '',
      base_fee: base_fee || '',
      latitude: latitude || '',
      longitude: longitude || '',
      location_source: location_source || 'manual'
    };

    req.session.form_errors = errors.array();
    return res.redirect('/rider/register');
  }
  return next();
};

module.exports = { registrationRules, checkRegData };

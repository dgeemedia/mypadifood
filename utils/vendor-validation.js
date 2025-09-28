// utils/vendor-validation.js
const { body, validationResult } = require("express-validator");
const models = require("../models");
const vendorModel = models.vendor;

const registrationRules = () => {
  return [
    body("name")
      .trim()
      .notEmpty()
      .withMessage("Vendor / Stall name is required.")
      .isLength({ min: 2 })
      .withMessage("Vendor name must be at least 2 characters."),

    body("state").trim().notEmpty().withMessage("State is required."),

    body("lga").trim().notEmpty().withMessage("LGA is required."),

    body("address")
      .trim()
      .notEmpty()
      .withMessage("Address is required.")
      .isLength({ min: 5 })
      .withMessage("Address looks too short."),

    body("phone")
      .trim()
      .notEmpty()
      .withMessage("Phone is required.")
      .isLength({ min: 6 })
      .withMessage("Phone looks too short."),

    body("email")
      .trim()
      .notEmpty()
      .withMessage("Email is required.")
      .isEmail()
      .withMessage("Please provide a valid email address.")
      .normalizeEmail(),

    body("food_item").trim().notEmpty().withMessage("Please list at least one food item."),

    body("base_price")
      .notEmpty()
      .withMessage("Base price is required.")
      .isFloat({ min: 0 })
      .withMessage("Base price must be a positive number."),
  ];
};

const checkRegData = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    // Preserve submitted values (but never store raw passwords — none here)
    const {
      name,
      state,
      lga,
      address,
      phone,
      email,
      food_item,
      base_price,
      latitude,
      longitude,
      location_source,
    } = req.body;

    req.session.form_data = {
      name: name || "",
      state: state || "",
      lga: lga || "",
      address: address || "",
      phone: phone || "",
      email: email || "",
      food_item: food_item || "",
      base_price: base_price || "",
      latitude: latitude || "",
      longitude: longitude || "",
      location_source: location_source || "manual",
    };

    req.session.form_errors = errors.array();

    return res.redirect("/vendor/register");
  }
  return next();
};

module.exports = { registrationRules, checkRegData };

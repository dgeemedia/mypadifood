// routes/client.js
const express = require("express");
const router = express.Router();

const clientController = require("../controllers/clientController");
const clientValidation = require("../utils/client-validation");
const auth = require("../middleware/auth");

// Registration & verification
router.get("/register", clientController.showRegister);

// Apply validation middleware before the controller handler for POST /register
router.post(
  "/register",
  clientValidation.registrationRules(),
  clientValidation.checkRegData,
  clientController.register
);

router.get("/verify", clientController.verifyEmail);

// Show resend verification form
router.get("/resend-verification", clientController.showResendForm);
router.post("/resend-verification", clientController.resendVerification);

// Login/logout
router.get("/login", clientController.showLogin);
router.post("/login", clientController.login);
router.get("/logout", clientController.logout);

// Dashboard & booking (protected)
router.get("/dashboard", auth.requireClient, clientController.dashboard);
router.post("/book", auth.requireClient, clientController.bookVendor);

router.post("/order/:orderId/menu", auth.requireClient, clientController.postOrderMenu);

module.exports = router;

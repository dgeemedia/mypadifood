// routes/rider.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const riderController = require('../controllers/riderController');
const riderValidation = require('../utils/rider-validation');

// ensure folder exists (create at startup if needed)
const uploadDir = path.join(__dirname, '..', 'uploads', 'riders');
const fs = require('fs');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const safe = Date.now() + '-' + file.originalname.replace(/\s+/g, '_');
    cb(null, safe);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 3 * 1024 * 1024 }, // 3MB limit - adjust as needed
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Only image uploads allowed'), false);
    cb(null, true);
  }
});

router.get('/register', riderController.showRegisterForm);

router.post(
  '/register',
  upload.single('id_file'), // name of file input
  riderValidation.registrationRules(),
  riderValidation.checkRegData,
  riderController.register
);

router.get('/thanks', riderController.thanksPage);

module.exports = router;

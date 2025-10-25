// routes/adminPartners.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { pool } = require('../database/database');
const auth = require('../middleware/auth');

const uploadDir = path.join(__dirname, '../public/uploads/partners');

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) =>
      cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, '-')}`),
  }),
  fileFilter: (req, file, cb) => {
    if (/^image\/(png|jpe?g|webp|svg)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Invalid image type'), false);
  },
  limits: { fileSize: 2 * 1024 * 1024 },
});

// list partners
router.get('/', auth.requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, name, logo_url, website, created_at FROM partners ORDER BY created_at DESC'
    );
    res.render('admin/partners-list', {
      partners: rows,
      currentUser: res.locals.currentUser,
    });
  } catch (err) {
    console.error('partners list error', err);
    req.flash('error', 'Could not load partners');
    res.redirect('/admin/dashboard');
  }
});

// add partner
router.post(
  '/add',
  auth.requireAdmin,
  upload.single('logo'),
  async (req, res) => {
    try {
      const { name, website } = req.body;
      const logo_url = req.file
        ? `/uploads/partners/${req.file.filename}`
        : null;
      await pool.query(
        'INSERT INTO partners (name, logo_url, website) VALUES ($1,$2,$3)',
        [name, logo_url, website]
      );
      req.flash('success', 'Partner added');
      res.redirect('/admin/partners');
    } catch (err) {
      console.error('partner add error', err);
      req.flash('error', 'Error adding partner');
      res.redirect('/admin/partners');
    }
  }
);

// optional delete handler
router.post('/delete', auth.requireAdmin, async (req, res) => {
  try {
    const id = req.body.id;
    if (!id) {
      req.flash('error', 'Missing partner id');
      return res.redirect('/admin/partners');
    }

    // fetch partner to remove file if any
    const { rows } = await pool.query(
      'SELECT logo_url FROM partners WHERE id=$1 LIMIT 1',
      [id]
    );
    if (rows && rows[0] && rows[0].logo_url) {
      const logoUrl = rows[0].logo_url;
      // only remove files under /uploads/partners for safety
      if (logoUrl.startsWith('/uploads/partners/')) {
        const filePath = path.join(__dirname, '..', 'public', logoUrl);
        try {
          await fs.unlink(filePath).catch(() => {});
        } catch (e) {
          // ignore deletion error (log)
          console.warn('Could not remove partner logo file', filePath, e);
        }
      }
    }

    await pool.query('DELETE FROM partners WHERE id=$1', [id]);
    req.flash('success', 'Partner removed');
    res.redirect('/admin/partners');
  } catch (err) {
    console.error('partner delete error', err);
    req.flash('error', 'Could not delete partner');
    res.redirect('/admin/partners');
  }
});

module.exports = router;

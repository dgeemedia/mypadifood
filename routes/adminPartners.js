// routes/adminPartners.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { pool } = require('../database/database');
const fs = require('fs');

const uploadsDir = path.join(__dirname, '../public/uploads/partners');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g,'-')}`)
  }),
  fileFilter: (req, file, cb) => {
    if (/^image\/(png|jpe?g|webp|svg)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Invalid image type'), false);
  },
  limits: { fileSize: 2 * 1024 * 1024 }
});

router.use((req, res, next) => {
  // simple admin check; replace with your real auth check
  if (!req.user || (req.user && req.user.type !== 'admin' && req.user.role !== 'admin')) {
    return res.status(403).send('Forbidden');
  }
  next();
});

router.get('/', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM partners ORDER BY created_at DESC');
  res.render('admin/partners-list', { partners: rows });
});

router.post('/add', upload.single('logo'), async (req, res) => {
  const { name, website } = req.body;
  const logo_url = req.file ? `/uploads/partners/${req.file.filename}` : null;
  await pool.query('INSERT INTO partners (name, logo_url, website) VALUES ($1,$2,$3)', [name, logo_url, website]);
  req.flash('success', 'Partner added');
  res.redirect('/admin/partners');
});

router.post('/:id/delete', async (req, res) => {
  const { id } = req.params;
  // optional: delete file from disk
  const { rows } = await pool.query('SELECT logo_url FROM partners WHERE id = $1', [id]);
  if (rows && rows[0] && rows[0].logo_url) {
    const filePath = path.join(__dirname, '..', rows[0].logo_url.replace(/^\//, ''));
    fs.unlink(filePath, (err) => { if (err) console.warn('unlink error', err); });
  }
  await pool.query('DELETE FROM partners WHERE id = $1', [id]);
  req.flash('success', 'Partner removed');
  res.redirect('/admin/partners');
});

module.exports = router;

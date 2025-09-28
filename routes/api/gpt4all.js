// routes/api/gpt4all.js (debug version)
const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const gpt4all = require('../../utils/gpt4all');

const limiter = rateLimit({
  windowMs: 10 * 1000,
  max: 6,
  message: { error: 'Slow down — too many messages' },
});

router.post('/', limiter, async (req, res) => {
  console.log(
    '[express route] /api/gpt4all body:',
    JSON.stringify(req.body).slice(0, 2000)
  );
  try {
    const { message, history } = req.body;
    if (!message || typeof message !== 'string') {
      console.warn('[express route] missing message');
      return res.status(400).json({ error: 'Missing `message` string' });
    }

    const reply = await gpt4all.sendMessage({
      message,
      history,
      session: req.session,
    });
    return res.json({ ok: true, reply });
  } catch (err) {
    console.error(
      '[express route] error:',
      err && err.message ? err.message : err
    );
    // If axios-like error with response, log it
    if (err.response) {
      console.error(
        '[express route] err.response.status:',
        err.response.status
      );
      console.error(
        '[express route] err.response.data:',
        JSON.stringify(err.response.data).slice(0, 2000)
      );
    }
    // Temporarily return debug info (safe for local dev). Remove in production.
    return res.status(500).json({
      error: 'Server error',
      details: err.response
        ? err.response.data || err.response.status
        : err.message || String(err),
    });
  }
});

module.exports = router;

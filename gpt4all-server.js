// gpt4all-server.js
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const { execFile } = require('child_process');
const cors = require('cors');

const APP_PORT = process.env.GPT4ALL_SERVER_PORT || 8080;
const MODE = (process.env.GPT4ALL_MODE || 'proxy').toLowerCase(); // 'proxy' or 'cli'
const REMOTE_URL = process.env.GPT4ALL_REMOTE_URL; // used in proxy mode
const CLI_PATH = process.env.GPT4ALL_CLI_PATH || 'gpt4all'; // used in cli mode
const MODEL_PATH = process.env.GPT4ALL_MODEL_PATH; // optional model path for CLI
const API_KEY = process.env.GPT4ALL_API_KEY || null; // optional key for requests to this wrapper

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '100kb' }));

// simple API key guard (optional)
app.use((req, res, next) => {
  if (API_KEY) {
    const provided =
      req.headers['x-api-key'] ||
      req.query.api_key ||
      (req.body && req.body.api_key);
    if (!provided || provided !== API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }
  next();
});

app.get('/', (req, res) => {
  res.json({ ok: true, mode: MODE });
});

// inside gpt4all-server.js — replace the current app.post('/v1/chat', ...) handler with this:
app.post('/v1/chat', async (req, res) => {
  try {
    console.log('[wrapper] /v1/chat incoming headers:', req.headers);
    console.log(
      '[wrapper] /v1/chat body:',
      JSON.stringify(req.body).slice(0, 2000)
    ); // avoid huge logs

    const { input, history, meta } = req.body || {};
    if (!input || typeof input !== 'string') {
      console.warn('[wrapper] missing input in request');
      return res.status(400).json({ error: 'Missing input string' });
    }

    if (MODE === 'proxy') {
      if (!REMOTE_URL) {
        console.error('[wrapper] REMOTE_URL not configured');
        return res
          .status(500)
          .json({ error: 'GPT4ALL_REMOTE_URL not configured' });
      }
      try {
        const headers = {};
        if (process.env.GPT4ALL_REMOTE_KEY)
          headers['Authorization'] = `Bearer ${process.env.GPT4ALL_REMOTE_KEY}`;

        const resp = await axios.post(
          REMOTE_URL,
          { input, history, meta },
          { headers, timeout: 120000 }
        );
        console.log(
          '[wrapper] remote responded status=',
          resp.status,
          'data snippet=',
          JSON.stringify(resp.data).slice(0, 1000)
        );
        return res.json(resp.data);
      } catch (err) {
        // detailed axios error logging
        console.error(
          '[wrapper] error proxying to remote GPT4All UI: ',
          err.message
        );
        if (err.response) {
          console.error('[wrapper] remote resp status:', err.response.status);
          console.error(
            '[wrapper] remote resp data:',
            JSON.stringify(err.response.data).slice(0, 2000)
          );
          return res.status(502).json({
            error: 'Remote service error',
            status: err.response.status,
            data: err.response.data,
          });
        }
        console.error('[wrapper] axios/network error details:', err);
        return res
          .status(502)
          .json({ error: 'Remote proxy network error', details: err.message });
      }
    }

    // CLI mode
    const prompt = String(input).trim();
    const args = [];
    if (MODEL_PATH) args.push('--model', MODEL_PATH);
    args.push('--prompt', prompt);

    execFile(
      CLI_PATH,
      args,
      { timeout: 120000, maxBuffer: 1024 * 1024 * 5 },
      (err, stdout, stderr) => {
        if (err) {
          console.error('[wrapper] gpt4all CLI error:', err, 'stderr:', stderr);
          return res.status(500).json({
            error: 'Model error',
            details: (err && err.message) || stderr,
          });
        }
        const reply = (stdout || '').toString().trim();
        return res.json({ reply });
      }
    );
  } catch (outer) {
    console.error('[wrapper] unexpected error in /v1/chat:', outer);
    return res
      .status(500)
      .json({ error: 'Server error', details: outer.message || String(outer) });
  }
});

app.listen(APP_PORT, () => {
  console.log(
    `GPT4All wrapper running in ${MODE} mode on http://localhost:${APP_PORT}`
  );
});

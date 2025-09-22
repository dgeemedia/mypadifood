// utils/gpt4all.js
const axios = require('axios');

const API_URL = process.env.GPT4ALL_API_URL || 'http://localhost:8080/v1/chat';
const WRAPPER_KEY = process.env.GPT4ALL_API_KEY || null;

async function sendMessage({ message, history = [], session = {} } = {}) {
  if (!message) throw new Error('Missing message');

  const payload = { input: message, history, meta: { sessionId: (session && session.id) || undefined } };
  const headers = { 'Content-Type': 'application/json' };
  if (WRAPPER_KEY) headers['x-api-key'] = WRAPPER_KEY;

  try {
    console.log('[gpt4all util] calling wrapper', API_URL, 'payload snippet:', JSON.stringify(payload).slice(0,1000));
    const resp = await axios.post(API_URL, payload, { headers, timeout: 120000 });
    console.log('[gpt4all util] wrapper status=', resp.status, 'data snippet=', JSON.stringify(resp.data).slice(0,1000));
    if (resp.data && resp.data.reply) return resp.data.reply;
    return resp.data;
  } catch (err) {
    console.error('[gpt4all util] error calling wrapper:', err.message);
    if (err.response) {
      console.error('[gpt4all util] wrapper response status:', err.response.status);
      console.error('[gpt4all util] wrapper response data:', JSON.stringify(err.response.data).slice(0,2000));
      // rethrow with helpful message
      throw new Error(`Wrapper error ${err.response.status}: ${JSON.stringify(err.response.data)}`);
    }
    throw err;
  }
}

module.exports = { sendMessage };

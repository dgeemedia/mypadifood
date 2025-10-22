// controllers/clientTransactionsController.js
const models = require('../models');
const walletModel = models.wallet;
const withdrawalModel = models.withdrawal;
const paymentModel = models.payment;
const db = require('../database/database'); // { pool }

/**
 * Redirects to login or returns 401 JSON when unauthenticated.
 * Returns null when OK.
 */
async function requiresClient(req, res) {
  if (!req.session || !req.session.user || req.session.user.type !== 'client') {
    if (req.xhr || (req.headers.accept || '').includes('application/json')) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    req.session && (req.session.error = 'Please log in');
    return res.redirect('/client/login');
  }
  return null;
}

exports.listClientTransactions = async (req, res) => {
  try {
    const guard = await requiresClient(req, res);
    if (guard) return guard;

    const clientId = req.session.user.id;

    // Wallet info (balance + id)
    const wallet = await walletModel.getByClientId(clientId);

    // Wallet transactions (credits/debits). Use DB fallback query (safe: filtered by client_id)
    const { rows: walletTxRows } = await db.pool.query(
      `SELECT wt.*
       FROM wallet_transactions wt
       WHERE wt.client_id = $1
       ORDER BY wt.created_at DESC
       LIMIT 200`,
      [clientId]
    );

    // Withdrawal requests (client requests for withdrawal)
    let withdrawals = [];
    try {
      withdrawals = await withdrawalModel.getRequestsByClient(clientId, 200);
    } catch (e) {
      withdrawals = [];
    }

    // Best-effort: recent payments referencing this client (search raw JSON fields)
    let payments = [];
    try {
      const { rows: pRows } = await db.pool.query(
        `SELECT * FROM payments
         WHERE (raw->'data'->'metadata'->>'clientId' = $1
                OR raw->'data'->'meta'->>'clientId' = $1
                OR raw->'metadata'->>'clientId' = $1
                OR raw->>'metadata' = $2)
         ORDER BY created_at DESC
         LIMIT 200`,
        [String(clientId), null]
      );
      payments = pRows || [];
    } catch (e) {
      payments = [];
    }

    return res.render('client/transactions', {
      title: 'Transactions',
      layout: 'layouts/layout',
      wallet: wallet || { balance: 0 },
      walletTransactions: walletTxRows || [],
      withdrawals: withdrawals || [],
      payments: payments || [],
      user: req.session.user,
    });
  } catch (err) {
    console.error('listClientTransactions error', err);
    req.session && (req.session.error = 'Could not load transactions');
    return res.redirect('/client/dashboard');
  }
};

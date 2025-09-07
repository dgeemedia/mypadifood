const Wallet = require('../models/walletModel');
const Transactions = require('../models/transactionModel');

exports.getWallet = async (req, res) => {
  try {
    const user = req.session.user;
    if (!user) return res.status(401).send('login required');
    const wallet = await Wallet.getByUserId(user.id);
    const tx = await Transactions.getByWalletId(wallet.id);
    res.json({ wallet, transactions: tx });
  } catch (err) {
    console.error(err);
    res.status(500).send('server error');
  }
};

// mock topup
exports.topup = async (req, res) => {
  try {
    const user = req.session.user;
    if (!user) return res.status(401).send('login required');
    const { amount } = req.body;
    const wallet = await Wallet.getByUserId(user.id);
    await Transactions.create({ wallet_id: wallet.id, type: 'topup', amount: Number(amount), description: 'Mock topup' });
    await Wallet.updateBalance(wallet.id, Number(wallet.balance) + Number(amount));
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).send('server error');
  }
};

const Orders = require('../models/orderModel');
const Wallet = require('../models/walletModel');
const Transactions = require('../models/transactionModel');
const sendAdminEmail = require('../utilities/smsEmail');

exports.create = async (req, res) => {
  try {
    const user = req.session.user;
    if (!user) return res.status(401).send('login required');
    const { vendor_id, menu_item_id, list_price, payment_method, quantity = 1, accept_terms } = req.body;
    const priceTotal = Number(list_price) * Number(quantity);
    if (payment_method === 'pay_now') {
      // check wallet
      const wallet = await Wallet.getByUserId(user.id);
      if (!wallet || Number(wallet.balance) < priceTotal) return res.status(400).send('Insufficient balance');
      // create order
      const order = await Orders.create({ customer_id: user.id, vendor_id, menu_item_id, amount: priceTotal, status: 'paid' });
      // debit
      await Transactions.create({ wallet_id: wallet.id, type: 'order_payment', amount: -priceTotal, description: `Order ${order.id}` });
      // cashback 5%
      const cashback = Math.round(priceTotal * 0.05);
      await Transactions.create({ wallet_id: wallet.id, type: 'cashback', amount: cashback, description: `Cashback for order ${order.id}` });
      await Wallet.updateBalance(wallet.id, Number(wallet.balance) - priceTotal + cashback);
      await sendAdminEmail('New order placed', `Customer ${user.name} ordered ${priceTotal} from vendor ${vendor_id}`);
      return res.json({ ok: true, order });
    } else if (payment_method === 'pay_on_delivery') {
      if (!accept_terms) return res.status(400).send('Please accept terms');
      const markUp = Math.round(priceTotal * 0.10);
      const expected = priceTotal + markUp;
      const order = await Orders.create({ customer_id: user.id, vendor_id, menu_item_id, amount: expected, status: 'pending' });
      await sendAdminEmail('POD order placed', `Customer ${user.name} placed POD order ${order.id} for vendor ${vendor_id}`);
      return res.json({ ok: true, order });
    }
    return res.status(400).send('invalid payment method');
  } catch (err) {
    console.error(err);
    res.status(500).send('server error');
  }
};

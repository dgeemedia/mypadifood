// models/index.js

module.exports = {
  client: require('./clientModel'),
  vendor: require('./vendorModel'),
  admin: require('./adminModel'),
  order: require('./orderModel'),
  verification: require('./verificationModel'),
  message: require('./messageModel'),
  payment: require('./paymentModel'),
  notification: require('./notificationModel'),
  adminReset: require('./adminResetModel'),
  weeklyPlan: require('./weeklyPlanModel'),
  weeklyPlanMessages: require('./weeklyPlanMessageModel'),
  rider: require('./riderModel'),
  wallet: require('./walletModel'),
  withdrawal: require('./withdrawalModel'),

};

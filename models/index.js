// models/index.js (append)
module.exports = {
  client: require('./clientModel'),
  vendor: require('./vendorModel'),
  admin: require('./adminModel'),
  order: require('./orderModel'),
  verification: require('./verificationModel'),
  message: require('./messageModel'),
  payment: require('./paymentModel'),
  notification: require('./notificationModel'),
};

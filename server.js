// server.js - main entrypoint
require('dotenv').config(); // load .env

const express = require('express');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session); // store sessions in Postgres
const path = require('path');
const expressLayouts = require('express-ejs-layouts'); // layout middleware for EJS

const app = express();
const PORT = process.env.PORT || 3000;

// database pool used by connect-pg-simple and controllers
const { pool } = require('./database/database'); // see database/database.js

// ===== create a session middleware instance (use same for app and socket.io) =====
const sessionMiddleware = session({
  store: new PgSession({
    pool: pool,
    tableName: 'session'
  }),
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 } // 1 day
});

// View engine: EJS + express-ejs-layouts
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Tell express-ejs-layouts where the default layout file lives
app.use(expressLayouts);
app.set('layout', 'layouts/layout'); // looks for views/layouts/layout.ejs

// Parsers
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Static assets
app.use(express.static(path.join(__dirname, 'public')));

// Use the shared session middleware with Express
app.use(sessionMiddleware);

// Flash-like helper (simple)
app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  res.locals.success = req.session.success || null;
  res.locals.error = req.session.error || null;
  res.locals.title = res.locals.title || 'MyPadiFood';
  delete req.session.success;
  delete req.session.error;
  next();
});

// Routes (chat and adminOrders assumed to exist)
app.use('/', require('./routes/index'));
app.use('/vendor', require('./routes/vendor'));
app.use('/client', require('./routes/client'));
app.use('/admin', require('./routes/admin'));
app.use('/chat', require('./routes/chat')); // chat route
app.use('/admin/orders', require('./routes/adminOrders'));
app.use('/api/paystack', require('./routes/payments')); // payment endpoints (stubs)

// Swagger (basic)
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: { title: 'MyPadifood API', version: '1.0.0' }
  },
  apis: ['./routes/*.js']
});
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// ===== Socket.IO setup: create HTTP server, attach socket.io, expose to controllers via utils/socket =====
const http = require('http');
const server = http.createServer(app);

const { Server } = require('socket.io');
const io = new Server(server);

// initialize socket util for controllers to emit events
const socketUtil = require('./utils/socket');
socketUtil.init(io);

// IMPORTANT: make the same session middleware available to socket.request
io.use((socket, next) => {
  // express-session expects (req, res, next) - we pass socket.request as req
  sessionMiddleware(socket.request, socket.request.res || {}, next);
});

// require models so we can check order ownership inside join handler
const models = require('./models');

// ====== CONNECTION HANDLER ======
io.on('connection', socket => {
  try {
    // attach session user for convenience (populated by io.use above)
    const sessUser = socket.request && socket.request.session && socket.request.session.user;

    // If this connection belongs to an admin/agent/super, join 'admins' room
    if (sessUser && (sessUser.type === 'admin' || sessUser.type === 'agent' || sessUser.type === 'super')) {
      socket.join('admins');
    }

    // Protected join order (only client / assigned admin / super)
    socket.on('join_order', async ({ orderId }) => {
      try {
        if (!orderId) return socket.emit('error', 'Missing orderId');

        const sess = socket.request && socket.request.session && socket.request.session.user;
        if (!sess) return socket.emit('error', 'Not authenticated');

        const order = await models.order.findById(orderId);
        if (!order) return socket.emit('error', 'Order not found');

        const isClient = sess.type === 'client' && String(sess.id) === String(order.client_id);
        const isAssignedAdmin =
          (sess.type === 'admin' || sess.type === 'agent') &&
          order.assigned_admin &&
          String(sess.id) === String(order.assigned_admin);
        const isSuper = sess.type === 'super';

        if (!(isClient || isAssignedAdmin || isSuper)) {
          return socket.emit('error', 'Not authorized to join this order');
        }

        // join the order room
        socket.join(`order_${orderId}`);

        // If the joiner is the order client, notify admins the client opened chat
        if (isClient && sess.type === 'client') {
          // If you want extra client info, fetch it from DB or rely on session fields
          // Here we attempt to get phone from DB (fallback to session)
          let clientPhone = sess.phone || null;
          try {
            const clientRow = await require('./models').client.findById(sess.id);
            if (clientRow && clientRow.phone) clientPhone = clientRow.phone;
          } catch (e) {
            // ignore phone fetch error; it's optional
          }

          const payload = {
            orderId,
            clientId: sess.id,
            clientName: sess.name || (order.client_name || null),
            clientPhone: clientPhone || (order.client_phone || null),
            timestamp: new Date()
          };

          // emit to all admins
          io.to('admins').emit('order_opened', payload);
        }

        socket.emit('joined_order', { ok: true, orderId });
      } catch (e) {
        console.error('join_order error', e);
        socket.emit('error', 'Could not join order');
      }
    });

    // 'open_chat' fallback - explicitly notify admins (verifies client ownership)
    socket.on('open_chat', async ({ orderId }) => {
      try {
        if (!orderId) return;
        const sess = socket.request && socket.request.session && socket.request.session.user;
        if (!sess || sess.type !== 'client') return;

        const order = await models.order.findById(orderId);
        if (!order) return;

        if (String(order.client_id) !== String(sess.id)) return;

        const payload = {
          orderId,
          clientId: sess.id,
          clientName: sess.name || (order.client_name || null),
          timestamp: new Date()
        };
        io.to('admins').emit('order_opened', payload);
        socket.emit('opened_ack', { ok: true });
      } catch (e) {
        console.error('open_chat error', e);
      }
    });

    // leave order (notify admins if client leaves)
    socket.on('leave_order', ({ orderId }) => {
      try {
        if (!orderId) return;
        const sess = socket.request && socket.request.session && socket.request.session.user;
        if (sess && sess.type === 'client') {
          const payload = {
            orderId,
            clientId: sess.id,
            clientName: sess.name || null,
            timestamp: new Date()
          };
          io.to('admins').emit('order_closed', payload);
        }
        socket.leave(`order_${orderId}`);
      } catch (e) {
        console.error('leave_order error', e);
      }
    });

    socket.on('disconnect', reason => {
      // optional: console.log('Socket disconnected', socket.id, reason);
    });
  } catch (outerErr) {
    console.error('socket connection error', outerErr);
  }
});
// ====== END CONNECTION HANDLER ======

/* Start HTTP + Socket.IO server */
server.listen(PORT, () => {
  console.log(`MyPadifood server running on http://localhost:${PORT}`);
});

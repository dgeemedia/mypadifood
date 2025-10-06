// server.js - main entrypoint
require('dotenv').config(); // load .env

const express = require('express');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session); // store sessions in Postgres
const path = require('path');
const expressLayouts = require('express-ejs-layouts'); // layout middleware for EJS
const cookieParser = require('cookie-parser');
const authJwt = require('./middleware/authJwt'); // JWT middleware (check token + require helpers)

const app = express();
const PORT = process.env.PORT || 3000;

// database pool used by connect-pg-simple and controllers
const { pool } = require('./database/database'); // see database/database.js

// ===== create a session middleware instance (use same for app and socket.io) =====
const sessionMiddleware = session({
  store: new PgSession({
    pool: pool,
    tableName: 'session',
  }),
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 }, // 1 day
});

// View engine: EJS + express-ejs-layouts
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Tell express-ejs-layouts where the default layout file lives
app.use(expressLayouts);
app.set('layout', 'layouts/layout'); // looks for views/layouts/layout.ejs

// Parsers (capture raw body for webhook signature verification)
app.use(express.urlencoded({ extended: true }));

// capture raw bytes into req.rawBody; also parse JSON into req.body
app.use(
  express.json({
    verify: (req, res, buf) => {
      // store raw buffer for later HMAC verification (webhooks)
      req.rawBody = buf;
    },
  })
);

// Parse cookies BEFORE the session middleware (so other middleware can read cookies)
app.use(cookieParser());

// Use the shared session middleware with Express
app.use(sessionMiddleware);

// Attach the JWT checker AFTER session middleware so it can use req.session for compatibility if desired
app.use(authJwt.checkJWTToken); // makes req.user and res.locals.currentUser available

// === Compatibility shim: copy JWT payload into session.user for legacy code & sockets ===
// This is executed immediately after authJwt.checkJWTToken so req.user (if any) is present.
app.use((req, res, next) => {
  try {
    if (req.user && req.session) {
      // copy minimal payload into session so legacy session-check code & sockets see it
      req.session.user = req.user;
    }
  } catch (e) {
    // don't block requests if shim fails
    console.error('JWT -> session shim error', e);
  }
  return next();
});

// use flash/messages middleware
app.use(require('./middleware/flash'));

// Static assets
app.use(express.static(path.join(__dirname, 'public')));

// Routes
// Mount auth routes early so /login etc are handled by the new controller
app.use('/', require('./routes/auth')); // <-- unified JWT login/logout routes
// --- MOUNT vendor router BEFORE the catch-all index router so literal paths like
//     /vendor/register are handled by the vendor router and not mistaken for :id
app.use('/vendor', require('./routes/vendor'));
app.use('/', require('./routes/index'));
app.use('/client', require('./routes/client'));
app.use('/admin', require('./routes/admin'));
app.use('/chat', require('./routes/chat')); // chat route
app.use('/admin/orders', require('./routes/adminOrders'));
app.use('/api', require('./routes/payments')); // payment endpoints (stubs)
app.use('/api/gpt4all', require('./routes/api/gpt4all')); // gpt4all support chat

// ===== Socket.IO setup: create HTTP server, attach socket.io, expose to controllers via utils/socket =====
const http = require('http');
const server = http.createServer(app);

const { Server } = require('socket.io');
// Ensure socket clients use credentials (cookies) so express-session can load the session.
// Use process.env.BASE_URL (or set SOCKET_ORIGIN) instead of '*' when possible for security.
const io = new Server(server, {
  cors: {
    origin: process.env.BASE_URL || `http://localhost:${PORT}`,
    credentials: true,
  },
});

// initialize socket util for controllers to emit events
const socketUtil = require('./utils/socket');
socketUtil.init(io);

// IMPORTANT: make the same session middleware available to socket.request
// Note: pass an empty object as res (some session implementations expect a res but socket doesn't provide one).
io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, next);
});

// require models so we can check order ownership inside join handler
const models = require('./models');

// ====== CONNECTION HANDLER ======
io.on('connection', (socket) => {
  try {
    console.log('Socket connected:', socket.id);

    // helper: fetch pending orders + unread notifications and send to a newly-joined admin socket
    async function sendInitialAdminState(sock) {
      try {
        // fetch pending orders for admin
        const pending = await models.order.getPendingOrdersForAdmin();

        // fetch unread notifications if the model exists (guarded)
        let notifications = [];
        if (
          models.notification &&
          typeof models.notification.getUnreadNotifications === 'function'
        ) {
          try {
            notifications = await models.notification.getUnreadNotifications();
          } catch (notifErr) {
            console.error(
              'Failed to load notifications (non-fatal):',
              notifErr
            );
            notifications = [];
          }
        }

        sock.emit('initial_admin_state', {
          orders: pending || [],
          notifications: notifications || [],
        });
      } catch (e) {
        console.error('sendInitialAdminState error', e);
      }
    }

    // If the HTTP session already marks this socket user as admin, auto-join the 'admins' room
    const sessUser =
      socket.request && socket.request.session && socket.request.session.user;
    if (
      sessUser &&
      (sessUser.type === 'admin' ||
        sessUser.type === 'agent' ||
        sessUser.type === 'super')
    ) {
      socket.join('admins');
      // send initial admin data immediately for this socket
      sendInitialAdminState(socket).catch((err) =>
        console.error('initial state send failed', err)
      );
    }

    // Allow clients to explicitly join the admins room as a fallback (client-side can emit 'admin_join')
    socket.on('admin_join', async () => {
      try {
        socket.join('admins');
        await sendInitialAdminState(socket);
      } catch (e) {
        console.error('admin_join error', e);
      }
    });

    // ... rest of your existing socket handlers unchanged ...
    socket.on('join_order', async ({ orderId }) => {
      try {
        if (!orderId) return socket.emit('error', 'Missing orderId');

        const sess =
          socket.request &&
          socket.request.session &&
          socket.request.session.user;
        if (!sess) return socket.emit('error', 'Not authenticated');

        const order = await models.order.findById(orderId);
        if (!order) return socket.emit('error', 'Order not found');

        const isClient =
          sess.type === 'client' && String(sess.id) === String(order.client_id);
        const isAssignedAdmin =
          (sess.type === 'admin' || sess.type === 'agent') &&
          order.assigned_admin &&
          String(sess.id) === String(order.assigned_admin);
        const isSuper = sess.type === 'super';

        if (!(isClient || isAssignedAdmin || isSuper)) {
          return socket.emit('error', 'Not authorized to join this order');
        }

        socket.join(`order_${orderId}`);

        // If a client joined their order room, tell admins that this order was opened by client presence
        if (isClient) {
          const payload = {
            orderId,
            clientId: sess.id,
            clientName: sess.name || order.client_name || null,
            clientPhone: sess.phone || order.client_phone || null,
            timestamp: new Date(),
          };
          io.to('admins').emit('order_opened', payload);
        }

        socket.emit('joined_order', { ok: true, orderId });
      } catch (e) {
        console.error('join_order error', e);
        socket.emit('error', 'Could not join order');
      }
    });

    socket.on('open_chat', async ({ orderId }) => {
      try {
        if (!orderId) return;
        const sess =
          socket.request &&
          socket.request.session &&
          socket.request.session.user;
        if (!sess || sess.type !== 'client') return;

        const order = await models.order.findById(orderId);
        if (!order) return;

        if (String(order.client_id) !== String(sess.id)) return;

        const payload = {
          orderId,
          clientId: sess.id,
          clientName: sess.name || order.client_name || null,
          timestamp: new Date(),
        };
        io.to('admins').emit('order_opened', payload);
        socket.emit('opened_ack', { ok: true });
      } catch (e) {
        console.error('open_chat error', e);
      }
    });

    socket.on('leave_order', ({ orderId }) => {
      try {
        if (!orderId) return;
        const sess =
          socket.request &&
          socket.request.session &&
          socket.request.session.user;
        if (sess && sess.type === 'client') {
          const payload = {
            orderId,
            clientId: sess.id,
            clientName: sess.name || null,
            timestamp: new Date(),
          };
          io.to('admins').emit('order_closed', payload);
        }
        socket.leave(`order_${orderId}`);
      } catch (e) {
        console.error('leave_order error', e);
      }
    });

    socket.on('disconnect', (reason) => {
      // optional: emit presence changes to admins if you like
    });
  } catch (outerErr) {
    console.error('socket connection error', outerErr);
  }
});

// Start server
server.listen(PORT, () => {
  console.log(`MyPadifood server running on http://localhost:${PORT}`);
});

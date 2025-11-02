require('dotenv').config(); // load .env

const express = require('express');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session); // store sessions in Postgres
const path = require('path');
const expressLayouts = require('express-ejs-layouts'); // layout middleware for EJS
const cookieParser = require('cookie-parser');
const authJwt = require('./middleware/authJwt'); // JWT middleware (check token + require helpers)
const careersRouter = require('./routes/careers'); // careers router
const contactRouter = require('./routes/contact');

const app = express();
const PORT = process.env.PORT || 3000;

// If behind a proxy (nginx, load balancer), trust proxy so req.ip, req.protocol, etc work correctly
app.set('trust proxy', true);

// database pool used by connect-pg-simple and controllers
const { pool } = require('./database/database'); // see database/database.js

// -----------------------------
// lightweight homepage cache + helper
// -----------------------------
const _homeCache = {
  ts: 0,
  ttl: 30 * 1000, // 30 seconds
  data: {
    stats: { vendors: 0, orders: 0, customers: 0 },
    partners: [],
    testimonials: [],
  },
};

// safe helper to check whether a DB table exists
async function tableExists(tableName) {
  try {
    const q = `SELECT to_regclass('public.${tableName}') IS NOT NULL AS exists`;
    const r = await pool.query(q);
    return r.rows[0] && r.rows[0].exists;
  } catch (err) {
    console.warn('tableExists error', err);
    return false;
  }
}

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
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
// additionally serve CV uploads from public/uploads for Careers page
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));
app.use('/locations', express.static(path.join(__dirname, 'locations')));


// === Improved middleware: expose request + currentUser to templates and force preferred host ===
// Put this AFTER session and auth, and BEFORE routes
const SITE_URL = process.env.SITE_URL || 'https://www.mypadifood.com';
let PREFERRED_HOST;
try {
  PREFERRED_HOST = new URL(SITE_URL).host; // e.g. 'www.mypadifood.com'
} catch (e) {
  PREFERRED_HOST = SITE_URL.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

app.use((req, res, next) => {
  // expose request + currentUser to views safely
  res.locals.request = req;
  res.locals.currentUser =
    req.user || (req.session && req.session.user) || null;

  // Do not force redirect in development or when SITE_URL is not configured
  if (process.env.NODE_ENV === 'development' || !PREFERRED_HOST) {
    return next();
  }

  // Normalize incoming host (strip port if present)
  const incomingHost = (req.headers.host || '').replace(/:\d+$/, '');

  // If incoming host is different from preferred host, redirect (301) to SITE_URL + path
  if (incomingHost && incomingHost !== PREFERRED_HOST) {
    // Avoid redirect for requests to known local hostnames
    const isLocalHost =
      incomingHost === 'localhost' || incomingHost === '127.0.0.1';

    if (!isLocalHost) {
      const target = SITE_URL.replace(/\/$/, '') + req.originalUrl;
      return res.redirect(301, target);
    }
  }

  next();
});

// homepage helpers: cached stats + partners + testimonials
// NOTE: place this before route registrations so index route and layout can use res.locals.*
app.use(async (req, res, next) => {
  // ensure templates always have safe defaults
  res.locals.partners = res.locals.partners || [];
  res.locals.testimonials = res.locals.testimonials || [];
  res.locals.stats = res.locals.stats || {};

  try {
    const now = Date.now();
    if (now - _homeCache.ts > _homeCache.ttl) {
      // refresh cache
      _homeCache.ts = now;

      // 1) stats (safe queries)
      const vendorsQ = await pool
        .query(
          "SELECT COUNT(*)::int AS count FROM vendors WHERE status = 'approved'"
        )
        .catch(() => ({ rows: [{ count: 0 }] }));
      const ordersQ = await pool
        .query('SELECT COUNT(*)::int AS count FROM orders')
        .catch(() => ({ rows: [{ count: 0 }] }));
      const customersQ = await pool
        .query('SELECT COUNT(*)::int AS count FROM clients')
        .catch(() => ({ rows: [{ count: 0 }] }));

      _homeCache.data.stats = {
        vendors: (vendorsQ.rows[0] && vendorsQ.rows[0].count) || 0,
        orders: (ordersQ.rows[0] && ordersQ.rows[0].count) || 0,
        customers: (customersQ.rows[0] && customersQ.rows[0].count) || 0,
      };

      // 2) partners (only if table exists)
      if (await tableExists('partners')) {
        const partnersQ = await pool
          .query(
            `SELECT id, name, COALESCE(logo_url,'') as logo_url, COALESCE(website,'') as website
             FROM partners
             ORDER BY created_at DESC
             LIMIT 12`
          )
          .catch(() => ({ rows: [] }));
        _homeCache.data.partners = partnersQ.rows || [];
      } else {
        _homeCache.data.partners = [];
      }

      // 3) testimonials (only if table exists)
      if (await tableExists('testimonials')) {
        const testiQ = await pool
          .query(
            `SELECT id, name, COALESCE(photo_url,'') as photo_url, city, quote
             FROM testimonials
             WHERE approved = true
             ORDER BY created_at DESC
             LIMIT 12`
          )
          .catch(() => ({ rows: [] }));
        _homeCache.data.testimonials = testiQ.rows || [];
      } else {
        _homeCache.data.testimonials = [];
      }
    }

    // expose to templates
    res.locals.stats = _homeCache.data.stats;
    res.locals.partners = _homeCache.data.partners;
    res.locals.testimonials = _homeCache.data.testimonials;
  } catch (err) {
    console.error('homepage data middleware error', err);
    // leave defaults
  }

  next();
});

// Routes (canonical)
app.use('/', require('./routes/auth'));
app.use('/vendor', require('./routes/vendor'));
app.use('/', require('./routes/index'));
app.use('/client', require('./routes/client'));
app.use('/admin', require('./routes/admin'));
app.use('/admin/resources', require('./routes/adminResources'));
app.use('/chat', require('./routes/chat'));
app.use('/admin/orders', require('./routes/adminOrders'));
app.use('/api/payments', require('./routes/payments')); // <-- payments router (thin routes)
app.use('/client/wallet', require('./routes/wallet')); // POST /client/wallet/fund etc
app.use('/client/transactions', require('./routes/clientTransactions'));
app.use('/rider', require('./routes/rider'));
app.use('/api/gpt4all', require('./routes/api/gpt4all'));
app.use('/careers', careersRouter);
app.use('/contact', contactRouter);

// Admin partners management
app.use('/admin/partners', require('./routes/adminPartners'));
app.use('/testimonials', require('./routes/testimonials'));
app.use('/admin/testimonials', require('./routes/adminTestimonials'));

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
          socket.request && socket.request.session && socket.request.session.user;
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

require('dotenv').config();
const path = require('path');
const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const session = require('express-session');
const pgSessionFactory = require('connect-pg-simple'); // factory
const helmet = require('helmet');
const morgan = require('morgan');
const cors = require('cors');

const staticRoutes = require('./routes/static');
const db = require('./models/db'); // <-- shared pool

const app = express();

app.use(helmet());
app.use(morgan('dev'));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Views
app.set('view engine', 'ejs');
app.use(expressLayouts);
app.set('layout', 'layouts/layout');
app.set('views', path.join(__dirname, 'views'));

// Session (Postgres store) using existing pool
const pgSession = pgSessionFactory(session);

const sessionStore = new pgSession({
  pool: db.pool,            // use our shared pool instance
  tableName: 'session',     // explicitly set table
  schemaName: 'public',     // ensure correct schema
  // pruneSessionInterval: 1000 * 60 * 60, // default (1 hour)
  pruneSessionInterval: 0   // disable auto-pruning for now (toggle if desired)
});

app.use(session({
  store: sessionStore,
  secret: process.env.SESSION_SECRET || 'devsecret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 } // 1 day
}));

// Flash + user binding middleware (available in all templates)
// - res.locals.user -> current logged-in user (or null)
// - res.locals.flash -> one-time flash message object { type, message }
// - req.setFlash(type, message) -> set a flash from controllers
app.use((req, res, next) => {
  // expose current user to views
  res.locals.user = req.session && req.session.user ? req.session.user : null;

  // simple session-backed flash
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;

  // helper to set flash messages from controllers
  req.setFlash = (type, message) => {
    req.session.flash = { type, message };
  };

  next();
});

// static files
app.use(staticRoutes);

// routes
app.use('/auth', require('./routes/auth'));
app.use('/vendors', require('./routes/vendors'));
app.use('/orders', require('./routes/orders'));
app.use('/bookings', require('./routes/bookings'));
app.use('/wallet', require('./routes/wallet'));
app.use('/admin', require('./routes/admin'));

app.get('/', async (req, res) => {
  res.render('index', { title: 'Home' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`MyPadiFood listening on http://localhost:${PORT}`);
});

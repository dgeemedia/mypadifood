require('dotenv').config();
const path = require('path');
const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const helmet = require('helmet');
const morgan = require('morgan');
const cors = require('cors');

const staticRoutes = require('./routes/static');

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

// Session (Postgres store)
const sessionConfig = {
  store: new pgSession({ conString: process.env.DATABASE_URL }),
  secret: process.env.SESSION_SECRET || 'devsecret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 }
};
app.use(session(sessionConfig));

// static
app.use(staticRoutes);

// routes
app.use('/auth', require('./routes/auth'));
app.use('/vendors', require('./routes/vendors'));
app.use('/orders', require('./routes/orders'));
app.use('/bookings', require('./routes/bookings'));
app.use('/wallet', require('./routes/wallet'));
app.use('/admin', require('./routes/admin'));

app.get('/', async (req, res) => {
  res.render('index', { title: 'Home', user: req.session.user || null });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`MyPadiFood listening on http://localhost:${PORT}`);
});

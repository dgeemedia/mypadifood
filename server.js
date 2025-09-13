// server.js - main entrypoint
// Load env variables and set up server, sessions, static assets, layouts, and routes.

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
// Serve 'public' at root so files are accessible as /js/main.js and /css/styles.css
app.use(express.static(path.join(__dirname, 'public')));

// Sessions: using Postgres session store for persistence
app.use(
  session({
    store: new PgSession({
      pool: pool, // connection pool
      tableName: 'session'
    }),
    secret: process.env.SESSION_SECRET || 'dev-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24 // 1 day
    }
  })
);

// Flash-like helper (simple)
app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null; // expose current user to views
  res.locals.success = req.session.success || null;
  res.locals.error = req.session.error || null;
  // make title safe default if not provided
  res.locals.title = res.locals.title || 'MyPadiFood';
  delete req.session.success;
  delete req.session.error;
  next();
});

// Routes
app.use('/', require('./routes/index'));
app.use('/vendor', require('./routes/vendor'));
app.use('/client', require('./routes/client'));
app.use('/admin', require('./routes/admin'));
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

// Start
app.listen(PORT, () => {
  console.log(`MyPadifood server running on http://localhost:${PORT}`);
});

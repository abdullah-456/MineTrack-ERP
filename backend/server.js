require('dotenv').config({ override: true });
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const db = require('./models');

const authRoutes = require('./routes/authRoutes');
const shopRoutes = require('./routes/shopRoutes');
const userRoutes = require('./routes/userRoutes');
const branchRoutes = require('./routes/branchRoutes');
const businessRoutes = require('./routes/businessRoutes');

const app = express();
const PORT = process.env.PORT || 5000;
app.set('trust proxy', 1); // Render (and most PaaS) sit behind a reverse proxy

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(helmet());

// CORS: allowlist from env (comma-separated). Falls back to localhost dev origins.
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    // allow same-origin / server-to-server / curl (no Origin header)
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

app.use(morgan('dev'));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Health check — declared BEFORE the '/api' business router so it isn't
// swallowed by that router's authenticate middleware.
app.get('/api/test', (req, res) => {
  res.json({ message: 'ESMS Backend Server is running!', version: '2.1-multitenant' });
});

// Throttle auth endpoints against brute force / credential stuffing.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many attempts. Please try again later.' },
});

// General API limiter (generous; protects against runaway clients).
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', apiLimiter);

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/refresh', authLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/shops', shopRoutes);
app.use('/api/users', userRoutes);
app.use('/api/branches', branchRoutes);
app.use('/api', businessRoutes);

// ── Global error handler (avoids leaking internals to clients) ────────────────
app.use((err, req, res, next) => {
  if (err && err.message === 'Not allowed by CORS') {
    return res.status(403).json({ message: 'Origin not allowed' });
  }
  console.error('Unhandled error:', err);
  return res.status(500).json({ message: 'Internal server error' });
});

// ── Database Connection & Server Startup ──────────────────────────────────────
async function startServer() {
  try {
    await db.sequelize.authenticate();
    console.log('Database connection established successfully.');

    app.listen(PORT, () => {
      console.log(`ESMS Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Unable to connect to the database:', error);
    process.exit(1);
  }
}

startServer();

require('dotenv').config({ override: true });
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const db = require('./models');
const { UploadValidationError } = require('./utils/employeeUploads');

const authRoutes = require('./routes/authRoutes');
const shopRoutes = require('./routes/shopRoutes');
const userRoutes = require('./routes/userRoutes');
const branchRoutes = require('./routes/branchRoutes');
const pitRoutes = require('./routes/pitRoutes');
const benchRoutes = require('./routes/benchRoutes');
const mineralRoutes = require('./routes/mineralRoutes');
const productionRoutes = require('./routes/productionRoutes');
const leaveRoutes = require('./routes/leaveRoutes');
const holidayRoutes = require('./routes/holidayRoutes');
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
  res.json({ message: 'Mine Track ERP Backend Server is running!', version: '2.1-multitenant' });
});

const isProduction = process.env.NODE_ENV === 'production';

// Throttle auth endpoints against brute force / credential stuffing.
// Development keeps a generous ceiling so a burst of failed refresh attempts
// (e.g. stale tabs after a server restart) doesn't lock out local sign-in.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProduction ? 10 : 200,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { message: 'Too many attempts. Please try again later.' },
});

const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProduction ? 30 : 500,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
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
app.use('/api/auth/refresh', refreshLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/shops', shopRoutes);
app.use('/api/users', userRoutes);
app.use('/api/branches', branchRoutes);
app.use('/api/pits', pitRoutes);
app.use('/api/benches', benchRoutes);
app.use('/api/minerals', mineralRoutes);
app.use('/api/production', productionRoutes);
app.use('/api/leave', leaveRoutes);
app.use('/api/holidays', holidayRoutes);
app.use('/api', businessRoutes);

// ── Global error handler (avoids leaking internals to clients) ────────────────
app.use((err, req, res, next) => {
  if (err && err.message === 'Not allowed by CORS') {
    return res.status(403).json({ message: 'Origin not allowed' });
  }
  if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'File is too large.' : err.message;
    return res.status(400).json({ message });
  }
  if (err instanceof UploadValidationError) {
    return res.status(400).json({ message: err.message });
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
      console.log(`Mine Track ERP Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Unable to connect to the database:', error);
    process.exit(1);
  }
}

startServer();

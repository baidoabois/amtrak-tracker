import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import rateLimit from 'express-rate-limit';
import connectDB from './src/config/db.js';
import authRoutes from './src/routes/auth.js';
import trainRoutes from './src/routes/trains.js';
import subscriptionRoutes from './src/routes/subscriptions.js';
import userRoutes from './src/routes/users.js';
import historyRoutes from './src/routes/history.js';
import { startPoller } from './src/services/poller.js';
import scheduleRoutes from './src/routes/schedule.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

const corsOrigin = process.env.NODE_ENV === 'production'
  ? (process.env.CLIENT_URL || true)  // true = allow same origin
  : process.env.CLIENT_URL || 'http://localhost:3000';
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json());

// Rate limit only auth endpoints to prevent brute force
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 50, message: { message: 'Too many attempts, please try again later.' } });

const PUBLIC_DIR = path.join(__dirname, 'public');
const CLIENT_DIR = path.join(__dirname, '../frontend/dist');

// Serve built React app in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(CLIENT_DIR));
}

// Static live board — no DB, no API, just a file read
app.get('/board', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'liveboard.html'), (err) => {
    if (err) res.status(503).send('<h2>Live board snapshot not yet available — check back in 2 minutes.</h2>');
  });
});

// Static train detail pages
app.get('/trains/:number', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'snapshots', `${req.params.number}.html`), (err) => {
    if (err) res.status(404).send('<h2>Train snapshot not yet available — check back in 2 minutes.</h2>');
  });
});

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/trains', trainRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/users', userRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/schedule', scheduleRoutes);

app.get('/api/health', (_, res) => res.json({ status: 'ok' }));

// SPA fallback — serve React index.html for all unmatched routes in production
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    res.sendFile(path.join(CLIENT_DIR, 'index.html'));
  });
}

app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ message: err.message || 'Internal server error' });
});

process.on('unhandledRejection', (err) => {
  console.error('[Server] Unhandled rejection:', err?.message || err);
});
process.on('uncaughtException', (err) => {
  console.error('[Server] Uncaught exception:', err?.message || err);
});

const PORT = process.env.PORT || 5000;

connectDB()
  .then(async () => {
    app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
    await startPoller();
  })
  .catch((err) => {
    console.error('Failed to connect to MongoDB:', err);
    process.exit(1);
  });

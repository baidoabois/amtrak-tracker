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
import { NAV_HTML } from './src/services/staticGen.js';
import scheduleRoutes from './src/routes/schedule.js';
import TrainHistory from './src/models/TrainHistory.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.set('trust proxy', 1); // Railway sits behind a proxy

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
app.get('/trains/:number', async (req, res) => {
  const filePath = path.join(PUBLIC_DIR, 'snapshots', `${req.params.number}.html`);
  res.sendFile(filePath, async (err) => {
    if (!err) return;

    let record = null;
    try {
      record = await TrainHistory.findOne(
        { trainNumber: req.params.number },
        null,
        { sort: { date: -1 } },
      ).lean();
    } catch { /* non-fatal */ }

    const num = req.params.number;
    const TZ_MAP = { P: 'America/Los_Angeles', M: 'America/Denver', C: 'America/Chicago', E: 'America/New_York' };
    const fmtTime = (iso, tz) => {
      if (!iso) return '—';
      return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: TZ_MAP[tz] || 'America/Los_Angeles' });
    };
    const fmtDate = (d) => d ? new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : null;

    const stationsHTML = record?.stations?.length ? record.stations.map(s => {
      const isDep = s.status === 'departed';
      const isArr = s.status === 'arrived';
      const isPast = isDep || isArr;
      const actDep = isDep ? (s.actualDeparture || s.estimatedDeparture || s.scheduledDeparture) : null;
      const schedDep = s.scheduledDeparture;
      const delay = schedDep && actDep ? Math.round((new Date(actDep) - new Date(schedDep)) / 60000) : null;
      const wasLate = delay !== null && delay > 5;
      const dotColor = isPast && wasLate ? '#ef4444' : isPast ? '#22c55e' : '#d1d5db';
      const nameColor = isPast && wasLate ? '#b91c1c' : isPast ? '#15803d' : '#9ca3af';
      const delayTag = delay === null ? '' : delay > 5 ? `<span style="color:#dc2626;font-weight:700;font-size:.7rem"> +${delay}m</span>` : delay < -1 ? `<span style="color:#16a34a;font-size:.7rem"> ${delay}m</span>` : '';
      const timeStr = actDep ? `<span style="color:#374151;font-size:.75rem">Dep: ${fmtTime(schedDep, s.tz)}${actDep && actDep !== schedDep ? ` → ${fmtTime(actDep, s.tz)}` : ''}${delayTag}</span>` : s.scheduledArrival ? `<span style="color:#374151;font-size:.75rem">Arr: ${fmtTime(s.scheduledArrival, s.tz)}</span>` : '';
      return `<div style="display:flex;gap:10px;padding:8px 6px;border-radius:6px;background:${isPast && wasLate ? '#fef2f2' : isPast ? '#f0fdf4' : 'transparent'}">
        <div style="width:20px;display:flex;justify-content:center;padding-top:4px">
          <span style="width:10px;height:10px;border-radius:50%;background:${dotColor};display:inline-block"></span>
        </div>
        <div>
          <div style="font-size:.85rem;font-weight:${isPast ? '600' : '400'};color:${nameColor}">${s.station?.name || s.code} <span style="color:#111827;font-weight:400;font-size:.75rem">(${s.code})</span></div>
          ${timeStr}
        </div>
      </div>`;
    }).join('') : '<p style="color:#9ca3af;font-size:.85rem">No station data available.</p>';

    const peakDelay = record?.peakDelayMinutes;
    const statusBadge = record
      ? record.state === 'Completed'
        ? `<span style="background:#bbf7d0;color:#14532d;padding:3px 10px;border-radius:999px;font-size:.8rem;font-weight:700">✓ Complete</span>`
        : peakDelay >= 15
        ? `<span style="background:#fef9c3;color:#92400e;padding:3px 10px;border-radius:999px;font-size:.8rem;font-weight:600">🕐 Peak delay ${peakDelay}m</span>`
        : `<span style="background:#dcfce7;color:#15803d;padding:3px 10px;border-radius:999px;font-size:.8rem;font-weight:600">✓ On Time</span>`
      : '';

    res.status(404).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Train ${num} — Not Currently Active | Amtrak Tracker</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f9fafb;color:#111827}
    a{color:#003876;text-decoration:none}
    .track-line{position:absolute;left:9px;top:6px;bottom:6px;width:2px;background:#e5e7eb}
  </style>
</head>
<body>
  ${NAV_HTML}

  <div style="max-width:800px;margin:0 auto;padding:24px 16px">

    <!-- Header card -->
    <div style="background:#fff;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,.08);padding:20px;margin-bottom:16px">
      <div style="display:flex;flex-wrap:wrap;justify-content:space-between;gap:12px">
        <div>
          <h1 style="font-size:1.8rem;font-weight:800;color:#003876">Train ${num}</h1>
          <div style="color:#6b7280;margin-top:4px">${record?.route || ''}</div>
          <div style="margin-top:8px">${statusBadge}</div>
        </div>
        <div style="text-align:right;font-size:.8rem;color:#9ca3af">
          ${record ? `<div>Last seen: <strong style="color:#6b7280">${fmtDate(record.date)}</strong></div>` : ''}
          ${record?.state ? `<div>State: <strong style="color:#6b7280">${record.state}</strong></div>` : ''}
        </div>
      </div>
    </div>

    <!-- Notice card -->
    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:16px;margin-bottom:16px;font-size:.875rem;color:#92400e;line-height:1.6">
      <strong>Train ${num} is not currently active.</strong>
      ${record
        ? ` Last scheduled on <strong>${fmtDate(record.date)}</strong>. If this train is scheduled today and has not appeared by its first departure time, it may have been cancelled.`
        : ' No recent activity found for this train number.'}
      Please check <a href="https://www.amtrak.com" target="_blank" style="color:#92400e;text-decoration:underline">Amtrak.com</a> for the latest schedule and cancellation information.
    </div>

    ${record?.stations?.length ? `
    <!-- Last known schedule -->
    <div style="background:#fff;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,.08);padding:20px">
      <h2 style="font-size:1rem;font-weight:600;color:#374151;margin-bottom:4px">Last Known Schedule — ${fmtDate(record.date)}</h2>
      <p style="font-size:.75rem;color:#9ca3af;margin-bottom:14px">Times shown are actual where available, otherwise scheduled (PST)</p>
      <div style="display:flex;gap:16px;flex-wrap:wrap;font-size:.72rem;color:#6b7280;margin-bottom:12px">
        <span>🟢 Departed on time</span>
        <span>🔴 Departed late (&gt;5m)</span>
        <span>⚪ Scheduled / not reached</span>
      </div>
      <div style="position:relative">
        <div class="track-line"></div>
        ${stationsHTML}
      </div>
    </div>` : ''}

    <div style="display:flex;gap:12px;margin-top:16px;flex-wrap:wrap">
      <a href="/board"    style="background:#003876;color:#fff;padding:8px 20px;border-radius:8px;font-size:.875rem;font-weight:600">View Live Board</a>
      <a href="/schedule" style="background:#fff;color:#003876;padding:8px 20px;border-radius:8px;font-size:.875rem;font-weight:600;border:1px solid #003876">Search Schedules</a>
    </div>
  </div>
</body>
</html>`);
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

import { Router } from 'express';
import { searchSchedule, getStations, loadGTFS } from '../services/gtfs.js';

const router = Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// GET /api/schedule/stations — full station list for autocomplete
router.get('/stations', wrap(async (req, res) => {
  const stations = await getStations();
  res.json({ stations });
}));

// GET /api/schedule/search?from=LAX&to=SAN&date=2026-04-28
router.get('/search', wrap(async (req, res) => {
  const { from, to, date } = req.query;
  if (!from || !to || !date) {
    return res.status(400).json({ message: 'from, to, and date are required' });
  }
  // Validate date format YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ message: 'date must be in YYYY-MM-DD format' });
  }
  const results = await searchSchedule(from.toUpperCase(), to.toUpperCase(), date);
  res.json({ results, from, to, date });
}));

// Kick off GTFS load in background on first request so it's warm
router.use((req, res, next) => { loadGTFS().catch(() => {}); next(); });

export default router;

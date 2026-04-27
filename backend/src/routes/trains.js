import { Router } from 'express';
import { getCachedTrains, getLastUpdated } from '../services/poller.js';
import { protect, adminOnly } from '../middleware/auth.js';
import Train from '../models/Train.js';

const router = Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// Public — all trains, falls back to DB if cache not yet populated
router.get('/', wrap(async (req, res) => {
  const cached = getCachedTrains();
  if (cached.length > 0) {
    return res.json({ trains: cached, lastUpdated: getLastUpdated(), count: cached.length, source: 'live' });
  }
  const trains = await Train.find().lean();
  res.json({ trains, lastUpdated: trains[0]?.lastFetched ?? null, count: trains.length, source: 'db' });
}));

// Public — single train by number, falls back to DB
router.get('/:number', wrap(async (req, res) => {
  const cached = getCachedTrains().find((t) => String(t.number) === req.params.number);
  if (cached) return res.json({ train: cached, source: 'live' });

  const train = await Train.findOne({ trainNumber: req.params.number }).lean();
  if (!train) return res.status(404).json({ message: 'Train not found' });
  res.json({ train, source: 'db' });
}));

// Admin — full data
router.get('/admin/all', protect, adminOnly, wrap(async (req, res) => {
  const cached = getCachedTrains();
  if (cached.length > 0) {
    return res.json({ trains: cached, lastUpdated: getLastUpdated(), source: 'live' });
  }
  const trains = await Train.find().lean();
  res.json({ trains, lastUpdated: trains[0]?.lastFetched ?? null, source: 'db' });
}));

export default router;

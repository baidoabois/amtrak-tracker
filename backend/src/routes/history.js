import { Router } from 'express';
import { protect, adminOnly } from '../middleware/auth.js';
import TrainHistory from '../models/TrainHistory.js';

const router = Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

router.get('/', protect, adminOnly, wrap(async (req, res) => {
  const { date, trainNumber, limit = 100, page = 1 } = req.query;
  const filter = {};
  if (date) filter.date = date;
  if (trainNumber) filter.trainNumber = trainNumber;

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const [records, total] = await Promise.all([
    TrainHistory.find(filter)
      .sort({ date: -1, trainNumber: 1 })
      .skip(skip)
      .limit(parseInt(limit))
      .select('-stations -__v')
      .lean(),
    TrainHistory.countDocuments(filter),
  ]);

  res.json({ records, total, page: parseInt(page), limit: parseInt(limit) });
}));

router.get('/dates', protect, adminOnly, wrap(async (req, res) => {
  const dates = await TrainHistory.distinct('date');
  res.json({ dates: dates.sort().reverse() });
}));

router.get('/:trainNumber', protect, adminOnly, wrap(async (req, res) => {
  const records = await TrainHistory.find({ trainNumber: req.params.trainNumber })
    .sort({ date: -1 })
    .select('-stations -__v')
    .lean();
  res.json({ records });
}));

export default router;

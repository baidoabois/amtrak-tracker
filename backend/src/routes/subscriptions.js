import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { protect } from '../middleware/auth.js';
import User from '../models/User.js';

const router = Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

router.get('/', protect, (req, res) => {
  res.json({ subscriptions: req.user.subscriptions });
});

router.post(
  '/',
  protect,
  [body('trainNumber').trim().notEmpty().withMessage('Train number required')],
  wrap(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { trainNumber, trainName, notifyDelay, notifyCancel } = req.body;
    const user = await User.findById(req.user._id);

    const exists = user.subscriptions.find((s) => s.trainNumber === trainNumber);
    if (exists) return res.status(400).json({ message: 'Already subscribed to this train' });

    user.subscriptions.push({
      trainNumber,
      trainName: trainName ?? '',
      notifyDelay: notifyDelay !== false,
      notifyCancel: notifyCancel !== false,
    });
    await user.save();
    res.status(201).json({ subscriptions: user.subscriptions });
  }),
);

router.delete('/:id', protect, wrap(async (req, res) => {
  const user = await User.findById(req.user._id);
  user.subscriptions = user.subscriptions.filter(
    (s) => String(s._id) !== req.params.id,
  );
  await user.save();
  res.json({ subscriptions: user.subscriptions });
}));

router.patch('/:id', protect, wrap(async (req, res) => {
  const user = await User.findById(req.user._id);
  const sub = user.subscriptions.id(req.params.id);
  if (!sub) return res.status(404).json({ message: 'Subscription not found' });

  if (req.body.notifyDelay !== undefined) sub.notifyDelay = req.body.notifyDelay;
  if (req.body.notifyCancel !== undefined) sub.notifyCancel = req.body.notifyCancel;
  if (req.body.trainName !== undefined) sub.trainName = req.body.trainName;

  await user.save();
  res.json({ subscriptions: user.subscriptions });
}));

export default router;

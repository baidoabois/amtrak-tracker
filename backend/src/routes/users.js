import { Router } from 'express';
import { protect, adminOnly } from '../middleware/auth.js';
import User from '../models/User.js';

const router = Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

router.patch('/me', protect, wrap(async (req, res) => {
  const { name, phone, notificationPreferences } = req.body;
  const user = await User.findById(req.user._id);

  if (name) user.name = name;
  if (phone !== undefined) user.phone = phone;
  if (notificationPreferences) {
    user.notificationPreferences = {
      ...user.notificationPreferences.toObject(),
      ...notificationPreferences,
    };
  }

  await user.save();
  res.json({ user });
}));

router.get('/', protect, adminOnly, wrap(async (req, res) => {
  const users = await User.find().select('-password');
  res.json({ users });
}));

export default router;

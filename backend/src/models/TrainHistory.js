import mongoose from 'mongoose';

const stationEntrySchema = new mongoose.Schema({
  code: String,
  tz: String,
  bus: Boolean,
  status: String,
  scheduledArrival: String,
  estimatedArrival: String,
  actualArrival: String,
  scheduledDeparture: String,
  estimatedDeparture: String,
  actualDeparture: String,
  station: {
    code: String,
    name: String,
    city: String,
    state: String,
    lat: Number,
    lon: Number,
  },
}, { _id: false });

const trainHistorySchema = new mongoose.Schema({
  trainNumber: { type: String, required: true },
  date: { type: String, required: true }, // YYYY-MM-DD in PST
  number: Number,
  route: String,
  heading: String,
  state: String,
  serviceDisrupted: Boolean,
  statusMsg: String,
  delayMinutes: Number,
  peakDelayMinutes: { type: Number, default: 0 }, // highest delay seen during the day
  velocity: Number,
  lat: Number,
  lon: Number,
  stations: [stationEntrySchema],
  positionHistory: [{
    lat: Number,
    lon: Number,
    velocity: Number,
    heading: String,
    recordedAt: { type: Date, default: Date.now },
    _id: false,
  }],
  finalized: { type: Boolean, default: false }, // set true at midnight PST
  firstSeenAt: { type: Date, default: Date.now },
  lastUpdatedAt: { type: Date, default: Date.now },
}, { timestamps: true });

// One record per train per PST day
trainHistorySchema.index({ trainNumber: 1, date: 1 }, { unique: true });

export default mongoose.model('TrainHistory', trainHistorySchema);

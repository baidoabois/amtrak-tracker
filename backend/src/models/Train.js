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

const trainSchema = new mongoose.Schema({
  trainNumber: { type: String, required: true, unique: true, index: true },
  number: Number,
  route: String,
  heading: String,
  velocity: Number,
  lat: Number,
  lon: Number,
  state: String,
  serviceDisrupted: Boolean,
  statusMsg: String,
  delayMinutes: Number,
  stations: [stationEntrySchema],
  lastFetched: { type: Date, default: Date.now },
}, { timestamps: true });

export default mongoose.model('Train', trainSchema);

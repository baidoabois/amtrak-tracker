import cron from 'node-cron';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchTrains } from './amtrak.js';
import { sendEmail, buildDelayEmail, buildCancellationEmail } from './notify.js';
import { writeTrainSnapshots, generateTrainHTML } from './staticGen.js';
import User from '../models/User.js';
import Train from '../models/Train.js';
import TrainHistory from '../models/TrainHistory.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const POLL_STAMP_FILE = path.join(__dirname, '../../public/.last_poll');
const POLL_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

async function getLastPollTime() {
  try {
    const ts = await fs.readFile(POLL_STAMP_FILE, 'utf8');
    return parseInt(ts.trim(), 10);
  } catch {
    return 0;
  }
}

async function writePollStamp(ts) {
  try {
    await fs.mkdir(path.dirname(POLL_STAMP_FILE), { recursive: true });
    await fs.writeFile(POLL_STAMP_FILE, String(ts), 'utf8');
  } catch {
    // non-fatal
  }
}

// In-memory snapshot of previous train states to detect changes
const previousStates = new Map();

let cachedTrains = [];
let lastUpdated = null;

export function getCachedTrains() { return cachedTrains; }
export function getLastUpdated() { return lastUpdated; }

// Returns current date string in PST (America/Los_Angeles), e.g. "2024-06-01"
function getPSTDateString(date = new Date()) {
  return date.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
}

function buildStationPayload(stations) {
  return stations.map((s) => ({
    code: s.code,
    tz: s.tz,
    bus: s.bus,
    status: s.status,
    scheduledArrival: s.scheduledArrival,
    estimatedArrival: s.estimatedArrival,
    actualArrival: s.actualArrival,
    scheduledDeparture: s.scheduledDeparture,
    estimatedDeparture: s.estimatedDeparture,
    actualDeparture: s.actualDeparture,
    station: s.station
      ? { code: s.station.code, name: s.station.name, city: s.station.city, state: s.station.state, lat: s.station.lat, lon: s.station.lon }
      : undefined,
  }));
}

async function saveTrainsToDB(trains) {
  // ── 1. Upsert latest state into `trains` collection ──────────────────────
  const now = new Date();
  const posPoint = (t) => t.lat && t.lon ? { lat: t.lat, lon: t.lon, velocity: t.velocity, heading: t.heading, recordedAt: now } : null;

  const activeOps = trains.map((t) => {
    const pos = posPoint(t);
    return {
      updateOne: {
        filter: { trainNumber: String(t.number) },
        update: {
          $set: {
            trainNumber: String(t.number),
            number: t.number,
            route: t.route,
            heading: t.heading,
            velocity: t.velocity,
            lat: t.lat,
            lon: t.lon,
            state: t.state,
            serviceDisrupted: t.serviceDisrupted,
            statusMsg: t.statusMsg,
            delayMinutes: t.delayMinutes,
            stations: buildStationPayload(t.stations),
            lastFetched: now,
          },
          ...(pos ? { $push: { positionHistory: { $each: [pos], $slice: -720 } } } : {}),
        },
        upsert: true,
      },
    };
  });
  await Train.bulkWrite(activeOps);

  // ── 2. Upsert today's history record in `trainhistory` collection ─────────
  const today = getPSTDateString();

  const historyOps = trains.map((t) => ({
    updateOne: {
      filter: { trainNumber: String(t.number), date: today },
      update: {
        $set: {
          // Fields we always overwrite with the freshest data
          number: t.number,
          route: t.route,
          heading: t.heading,
          velocity: t.velocity,
          lat: t.lat,
          lon: t.lon,
          state: t.state,
          serviceDisrupted: t.serviceDisrupted,
          statusMsg: t.statusMsg,
          delayMinutes: t.delayMinutes,
          stations: buildStationPayload(t.stations),
          lastUpdatedAt: now,
        },
        ...(posPoint(t) ? { $push: { positionHistory: { $each: [posPoint(t)], $slice: -720 } } } : {}),
        $max: { peakDelayMinutes: t.delayMinutes ?? 0 },
        $setOnInsert: {
          trainNumber: String(t.number),
          date: today,
          firstSeenAt: now,
          finalized: false,
        },
      },
      upsert: true,
    },
  }));
  await TrainHistory.bulkWrite(historyOps);
}

// Called at midnight PST — marks all of yesterday's records as finalized
async function finalizeYesterday() {
  const yesterday = getPSTDateString(new Date(Date.now() - 24 * 60 * 60 * 1000));
  const result = await TrainHistory.updateMany(
    { date: yesterday, finalized: false },
    { $set: { finalized: true } },
  );
  console.log(`[Poller] Finalized ${result.modifiedCount} history records for ${yesterday}`);
}

async function checkAndNotify(trains) {
  let users;
  try {
    users = await User.find({ 'subscriptions.0': { $exists: true } });
  } catch {
    return;
  }

  for (const train of trains) {
    const key = String(train.number);
    const prev = previousStates.get(key);

    const isNowDelayed = train.delayMinutes >= 15;
    const wasDelayed = prev?.delayMinutes >= 15;
    const isNowDisrupted = train.serviceDisrupted;
    const wasDisrupted = prev?.serviceDisrupted;

    for (const user of users) {
      const sub = user.subscriptions.find((s) => String(s.trainNumber) === key);
      if (!sub) continue;

      try {
        if (sub.notifyDelay && isNowDelayed && !wasDelayed) {
          const { subject, html } = buildDelayEmail(train, user);
          await sendEmail({ to: user.email, subject, html });
        }
        if (sub.notifyCancel && isNowDisrupted && !wasDisrupted) {
          const { subject, html } = buildCancellationEmail(train, user);
          await sendEmail({ to: user.email, subject, html });
        }
      } catch (err) {
        console.error(`Failed to send notification to ${user.email}:`, err.message);
      }
    }

    previousStates.set(key, { delayMinutes: train.delayMinutes, serviceDisrupted: train.serviceDisrupted });
  }
}

const SNAPSHOTS_DIR = path.join(__dirname, '../../public/snapshots');

// Re-render snapshots for today's completed trains that are no longer in the live feed.
// This ensures the "Complete" badge and fully-green station list are applied even after
// the train disappears from the Amtrak API.
async function regenerateCompletedSnapshots(activeNumbers) {
  // Look back 3 days so trains from recent days get re-rendered even after finalization
  const cutoff = getPSTDateString(new Date(Date.now() - 14 * 24 * 60 * 60 * 1000));
  // Find the most recent completed record per train number within the window
  const completed = await TrainHistory.aggregate([
    { $match: { state: 'Completed', date: { $gte: cutoff }, trainNumber: { $nin: activeNumbers.map(String) } } },
    { $sort: { date: -1 } },
    { $group: { _id: '$trainNumber', doc: { $first: '$$ROOT' } } },
    { $replaceRoot: { newRoot: '$doc' } },
  ]);

  if (!completed.length) return;

  await fs.mkdir(SNAPSHOTS_DIR, { recursive: true });
  await Promise.all(completed.map(async (rec) => {
    const train = {
      number: rec.number,
      route: rec.route || '',
      state: rec.state,
      velocity: rec.velocity || 0,
      delayMinutes: rec.delayMinutes || 0,
      serviceDisrupted: rec.serviceDisrupted || false,
      statusMsg: rec.statusMsg || '',
      stations: rec.stations || [],
    };
    const html = generateTrainHTML(train, rec.lastUpdatedAt || new Date(), rec.positionHistory || []);
    await fs.writeFile(path.join(SNAPSHOTS_DIR, `${train.number}.html`), html, 'utf8');
  }));
  console.log(`[Poller] Re-rendered ${completed.length} completed train snapshot(s)`);
}

async function poll() {
  try {
    console.log('[Poller] Fetching Amtrak data...');
    const trains = await fetchTrains();
    cachedTrains = trains;
    lastUpdated = new Date().toISOString();
    await writePollStamp(Date.now());
    console.log(`[Poller] Got ${trains.length} trains. Saving to DB and generating snapshots...`);
    await saveTrainsToDB(trains);

    // Fetch today's position histories for snapshot generation
    const today = getPSTDateString();
    const histories = await TrainHistory.find(
      { date: today, trainNumber: { $in: trains.map(t => String(t.number)) } },
      { trainNumber: 1, positionHistory: 1 },
    ).lean();
    const posHistoryMap = Object.fromEntries(histories.map(h => [h.trainNumber, h.positionHistory || []]));

    await writeTrainSnapshots(trains, lastUpdated, posHistoryMap);
    await checkAndNotify(trains);
    await regenerateCompletedSnapshots(trains.map(t => t.number));
  } catch (err) {
    console.error('[Poller] Error fetching trains:', err.message);
    // Keep serving the last good cache — do not clear cachedTrains
  }
}

export async function startPoller() {
  // On startup: only poll immediately if last poll was more than 2 minutes ago.
  // This prevents hammering Amtrak when nodemon restarts on file saves.
  const lastPoll = await getLastPollTime();
  const msSinceLast = Date.now() - lastPoll;

  if (msSinceLast >= POLL_INTERVAL_MS) {
    console.log('[Poller] Starting fresh poll on startup...');
    await poll();
  } else {
    const waitMs = POLL_INTERVAL_MS - msSinceLast;
    console.log(`[Poller] Last poll was ${Math.round(msSinceLast / 1000)}s ago — skipping startup poll, next in ${Math.round(waitMs / 1000)}s`);
  }

  cron.schedule('*/2 * * * *', poll);
  cron.schedule('0 0 * * *', finalizeYesterday, { timezone: 'America/Los_Angeles' });
  console.log('[Poller] Started — polling every 2 minutes, finalizing history at midnight PST');
}

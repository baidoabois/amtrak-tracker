import axios from 'axios';
import AdmZip from 'adm-zip';
import { fetchStations } from './amtrak.js';

const GTFS_URL = 'https://content.amtrak.com/content/gtfs/GTFS.zip';
const REFRESH_MS = 7 * 24 * 60 * 60 * 1000; // refresh weekly

let gtfsCache = null;
let lastLoaded = 0;

// ── CSV parser — handles quoted fields and BOM ───────────────────────────────
function parseCSV(text) {
  const lines = text.replace(/\r/g, '').trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^﻿/, ''));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const values = [];
    let cur = '';
    let inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { values.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    values.push(cur.trim());
    rows.push(Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ''])));
  }
  return rows;
}

// ── Service calendar helpers ─────────────────────────────────────────────────
const DOW = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function isServiceActive(serviceId, dateStr, calMap, calDateMap) {
  const gtfsDate = dateStr.replace(/-/g, '');
  const dow = DOW[new Date(dateStr + 'T12:00:00').getDay()];

  // calendar_dates exceptions override calendar
  const exceptions = calDateMap[serviceId]?.[gtfsDate];
  if (exceptions === '1') return true;
  if (exceptions === '2') return false;

  const cal = calMap[serviceId];
  if (!cal) return false;
  if (gtfsDate < cal.start_date || gtfsDate > cal.end_date) return false;
  return cal[dow] === '1';
}

// ── Convert GTFS time string + date → UTC ISO string ────────────────────────
// GTFS times are in the agency timezone (America/New_York for Amtrak).
// We convert to UTC so the frontend can re-format in any station timezone.
function gtfsTimeToISO(timeStr, dateStr, agencyTz) {
  if (!timeStr || !dateStr) return null;
  try {
    const [hRaw, mm, ss] = timeStr.split(':').map(Number);
    const dayOffset = Math.floor(hRaw / 24);
    const h = hRaw % 24;
    // Advance the base date if time exceeds 24h (next-day arrival)
    const base = new Date(dateStr + 'T12:00:00Z');
    base.setUTCDate(base.getUTCDate() + dayOffset);
    const adjDate = base.toISOString().slice(0, 10);
    const pad = n => String(n).padStart(2, '0');
    const localStr = `${adjDate}T${pad(h)}:${pad(mm)}:${pad(ss || 0)}`;
    // Parse as UTC naively, then correct for agency offset
    const naive = new Date(localStr + 'Z');
    const parts = {};
    new Intl.DateTimeFormat('en-US', {
      timeZone: agencyTz, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(naive).forEach(({ type, value }) => { parts[type] = value; });
    const hh = parts.hour === '24' ? 0 : +parts.hour;
    const tzDate = new Date(Date.UTC(+parts.year, +parts.month - 1, +parts.day, hh, +parts.minute, +parts.second));
    return new Date(naive.getTime() + (naive - tzDate)).toISOString();
  } catch {
    return null;
  }
}

// Returns minutes since midnight (handles >24h times)
function gtfsTimeToMins(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

// ── Load & cache GTFS ────────────────────────────────────────────────────────
export async function loadGTFS() {
  if (gtfsCache && Date.now() - lastLoaded < REFRESH_MS) return gtfsCache;

  console.log('[GTFS] Downloading Amtrak GTFS feed...');
  const response = await axios.get(GTFS_URL, {
    responseType: 'arraybuffer',
    timeout: 60000,
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });

  const zip = new AdmZip(Buffer.from(response.data));
  const OPTIONAL = new Set(['calendar_dates.txt']);
  const read = (name) => {
    const entry = zip.getEntry(name);
    if (!entry) {
      if (!OPTIONAL.has(name)) console.warn(`[GTFS] Missing file: ${name}`);
      return [];
    }
    return parseCSV(entry.getData().toString('utf8'));
  };

  const stops        = read('stops.txt');
  const stopTimes    = read('stop_times.txt');
  const trips        = read('trips.txt');
  const routes       = read('routes.txt');
  const calendar     = read('calendar.txt');
  const calDates     = read('calendar_dates.txt');
  const agency       = read('agency.txt');

  // Index maps
  const stopMap    = Object.fromEntries(stops.map(s => [s.stop_id, s]));
  const routeMap   = Object.fromEntries(routes.map(r => [r.route_id, r]));
  const tripMap    = Object.fromEntries(trips.map(t => [t.trip_id, t]));
  const calMap     = Object.fromEntries(calendar.map(c => [c.service_id, c]));

  // calDateMap[service_id][gtfsDate] = exception_type
  const calDateMap = {};
  for (const cd of calDates) {
    if (!calDateMap[cd.service_id]) calDateMap[cd.service_id] = {};
    calDateMap[cd.service_id][cd.date] = cd.exception_type;
  }

  // Group and sort stop_times by trip
  const stopTimesByTrip = {};
  for (const st of stopTimes) {
    if (!stopTimesByTrip[st.trip_id]) stopTimesByTrip[st.trip_id] = [];
    stopTimesByTrip[st.trip_id].push(st);
  }
  for (const tid of Object.keys(stopTimesByTrip)) {
    stopTimesByTrip[tid].sort((a, b) => parseInt(a.stop_sequence) - parseInt(b.stop_sequence));
  }

  // Build stop → trip index for fast lookup
  const tripsByStop = {};
  for (const [tripId, sts] of Object.entries(stopTimesByTrip)) {
    for (const st of sts) {
      if (!tripsByStop[st.stop_id]) tripsByStop[st.stop_id] = [];
      tripsByStop[st.stop_id].push(tripId);
    }
  }

  const agencyTz = agency[0]?.agency_timezone || 'America/New_York';
  gtfsCache = { stopMap, routeMap, tripMap, calMap, calDateMap, stopTimesByTrip, tripsByStop, stops, agencyTz };
  lastLoaded = Date.now();
  console.log(`[GTFS] Loaded: ${stops.length} stops, ${trips.length} trips, ${stopTimes.length} stop_times`);
  return gtfsCache;
}

const AMTRAK_TZ = { P: 'America/Los_Angeles', M: 'America/Denver', C: 'America/Chicago', E: 'America/New_York' };

function resolveStationTz(gtfsTz, amtrakStations, code) {
  if (gtfsTz) return gtfsTz;
  const s = amtrakStations.find(s => s.code === code);
  return s?.tz ? (AMTRAK_TZ[s.tz] || '') : '';
}

// ── Schedule search ──────────────────────────────────────────────────────────
export async function searchSchedule(fromCode, toCode, date) {
  const [{ stopMap, routeMap, tripMap, calMap, calDateMap, stopTimesByTrip, tripsByStop, agencyTz }, amtrakStations] =
    await Promise.all([loadGTFS(), fetchStations().catch(() => [])]);

  // Trips that serve both stops
  const fromTrips = new Set(tripsByStop[fromCode] || []);
  const toTrips   = new Set(tripsByStop[toCode]   || []);
  const candidates = [...fromTrips].filter(t => toTrips.has(t));

  const results = [];

  for (const tripId of candidates) {
    const trip = tripMap[tripId];
    if (!trip) continue;
    if (!isServiceActive(trip.service_id, date, calMap, calDateMap)) continue;

    const sts = stopTimesByTrip[tripId];
    const fromSt = sts.find(s => s.stop_id === fromCode);
    const toSt   = sts.find(s => s.stop_id === toCode);
    if (!fromSt || !toSt) continue;
    if (parseInt(fromSt.stop_sequence) >= parseInt(toSt.stop_sequence)) continue;

    const route = routeMap[trip.route_id];
    const depMins = gtfsTimeToMins(fromSt.departure_time);
    const arrMins = gtfsTimeToMins(toSt.arrival_time);
    const durationMins = arrMins - depMins + (arrMins < depMins ? 24 * 60 : 0);

    const fromTz = resolveStationTz(stopMap[fromCode]?.stop_timezone, amtrakStations, fromCode);
    const toTz   = resolveStationTz(stopMap[toCode]?.stop_timezone,   amtrakStations, toCode);

    results.push({
      tripId,
      trainNumber: trip.trip_short_name || trip.trip_id,
      routeName: route?.route_long_name || trip.trip_headsign || '',
      departureISO: gtfsTimeToISO(fromSt.departure_time, date, agencyTz),
      arrivalISO:   gtfsTimeToISO(toSt.arrival_time,     date, agencyTz),
      durationMins,
      fromStopName: stopMap[fromCode]?.stop_name || fromCode,
      toStopName: stopMap[toCode]?.stop_name || toCode,
      fromTz,
      toTz,
    });
  }

  results.sort((a, b) => (a.departureISO || '').localeCompare(b.departureISO || ''));
  return results;
}

// ── Station list for autocomplete ────────────────────────────────────────────
export async function getStations() {
  const { stops } = await loadGTFS();
  return stops
    .map(s => ({ code: s.stop_id, name: s.stop_name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

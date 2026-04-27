/**
 * Amtrak data service — decryption logic ported from mgwalker/amtrak-api
 * Hits maps.amtrak.com directly (same source as Amtrak's own train map).
 *
 * Encryption scheme (from backup.html / Greg's blog post):
 *  1. Public key lives in RoutesList.v.json at index = sum of ZoomLevels
 *  2. Salt + IV also live in that file
 *  3. Response = base64(encryptedData) + base64(encryptedPassword)[last 88 chars]
 *  4. Decrypt password with publicKey → privateKey
 *  5. Decrypt encryptedData with privateKey → JSON
 *  Algorithm: AES-128-CBC, key via PBKDF2-SHA1, 1000 iterations, 16-byte key
 */

import crypto from 'crypto';
import axios from 'axios';

const ROUTES_LIST_URL = 'https://maps.amtrak.com/rttl/js/RoutesList.json';
const ROUTES_LIST_V_URL = 'https://maps.amtrak.com/rttl/js/RoutesList.v.json';
const TRAINS_URL = 'https://maps.amtrak.com/services/MapDataService/trains/getTrainsData';
const STATIONS_URL = 'https://maps.amtrak.com/services/MapDataService/stations/trainStations';
const MASTER_SEGMENT = 88;

// Amtrak blocks requests without a browser-like User-Agent
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Referer': 'https://www.amtrak.com/',
  'Origin': 'https://www.amtrak.com',
};

const amtrakGet = (url) => axios.get(url, { headers: HEADERS, timeout: 15000 });

let cryptoCache = null;

async function getCryptoInitializers() {
  if (cryptoCache) return cryptoCache;

  const [routesList, routesListV] = await Promise.all([
    amtrakGet(ROUTES_LIST_URL).then((r) => r.data),
    amtrakGet(ROUTES_LIST_V_URL).then((r) => r.data),
  ]);

  const masterZoom = routesList.reduce((sum, { ZoomLevel }) => sum + (ZoomLevel ?? 0), 0);
  const publicKey = routesListV.arr[masterZoom];
  const salt = routesListV.s[routesListV.s[Math.floor(Math.random() * (routesListV.s.length + 1))].length];
  const iv = routesListV.v[routesListV.v[Math.floor(Math.random() * (routesListV.v.length + 1))].length];

  cryptoCache = { publicKey, salt, iv };

  // Bust cache after 1 hour — Amtrak may rotate keys
  setTimeout(() => { cryptoCache = null; }, 60 * 60 * 1000);

  return cryptoCache;
}

function deriveKey(password, saltHex) {
  return crypto.pbkdf2Sync(password, Buffer.from(saltHex, 'hex'), 1000, 16, 'sha1');
}

function decryptAES(ciphertext, key, ivHex) {
  const decipher = crypto.createDecipheriv(
    'aes-128-cbc',
    key,
    Buffer.from(ivHex, 'hex'),
  );
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

async function parseAmtrakResponse(rawData) {
  // If Amtrak rate-limits us it returns plain text, not an encrypted blob
  if (typeof rawData !== 'string' || rawData.length < MASTER_SEGMENT + 10) {
    throw new Error(`Unexpected response from Amtrak (length ${rawData?.length})`);
  }
  // Plain-text error responses won't be valid base64 blobs
  if (rawData.trimStart().startsWith('{') || rawData.trimStart().startsWith('Too many') || rawData.trimStart().startsWith('<')) {
    throw new Error(`Amtrak returned non-encrypted response: ${rawData.slice(0, 80)}`);
  }

  const { publicKey, salt, iv } = await getCryptoInitializers();

  const passwordCipher = rawData.slice(rawData.length - MASTER_SEGMENT);
  const privateKey = decryptAES(passwordCipher, deriveKey(publicKey, salt), iv).split('|')[0];

  const encryptedData = rawData.slice(0, rawData.length - MASTER_SEGMENT);
  const decrypted = decryptAES(encryptedData, deriveKey(privateKey, salt), iv);

  return JSON.parse(decrypted);
}

// ── Station helpers ──────────────────────────────────────────────────────────

export let stationCache = null;
let stationCacheTime = 0;
const STATION_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

export async function fetchStations() {
  if (stationCache && Date.now() - stationCacheTime < STATION_CACHE_TTL) {
    return stationCache;
  }

  const { data } = await amtrakGet(STATIONS_URL);
  const parsed = await parseAmtrakResponse(data);

  stationCache = ((parsed.StationsDataResponse ?? parsed).features ?? []).map(({ properties: p }) => ({
    code: p.Code,
    name: p.StationName,
    address1: p.Address1,
    address2: p.Address2,
    city: p.City,
    state: p.State,
    lat: parseFloat(p.lat),
    lon: parseFloat(p.lon),
    zip: p.Zipcode,
  }));
  stationCacheTime = Date.now();

  return stationCache;
}

// ── Train helpers ────────────────────────────────────────────────────────────

function parseStationEntry(raw) {
  if (!raw) return null;

  // postdep/postarr are actual datetime strings when the event happened, or undefined if not yet
  const hasDeparted = raw.postdep && raw.postdep !== 'NO';
  const hasArrived  = raw.postarr && raw.postarr !== 'NO';

  let status = 'scheduled';
  if (hasDeparted) status = 'departed';
  else if (hasArrived) status = 'arrived';

  const toUTC = (localTime) => {
    if (!localTime) return null;
    try {
      return new Date(localTime).toISOString();
    } catch {
      return null;
    }
  };

  return {
    code: raw.code,
    tz: raw.tz,
    bus: raw.bus === true,
    scheduledArrival: toUTC(raw.scharr),
    estimatedArrival: toUTC(raw.estarr),
    actualArrival: hasArrived ? toUTC(raw.postarr) : null,
    scheduledDeparture: toUTC(raw.schdep),
    estimatedDeparture: toUTC(raw.estdep),
    actualDeparture: hasDeparted ? toUTC(raw.postdep) : null,
    status,
    _raw: raw,
  };
}

function parseDelayMinutes(train) {
  // Find the first scheduled (not yet departed) station with estimated times
  for (const s of train.stations) {
    if (s.status !== 'scheduled') continue;
    const sched = s.scheduledArrival || s.scheduledDeparture;
    const est   = s.estimatedArrival || s.estimatedDeparture;
    if (sched && est) {
      return Math.max(0, Math.round((new Date(est) - new Date(sched)) / 60000));
    }
  }
  return 0;
}

export async function fetchTrains() {
  const [{ data: rawData }, stations] = await Promise.all([
    amtrakGet(TRAINS_URL),
    fetchStations(),
  ]);

  const parsed = await parseAmtrakResponse(rawData);
  const stationMap = Object.fromEntries(stations.map((s) => [s.code, s]));

  const trains = [];

  for (const feature of parsed.features ?? []) {
    const p = feature.properties;

    // Collect all StationN properties in order
    const stationEntries = [];
    for (let i = 1; i <= 41; i++) {
      const entry = p[`Station${i}`];
      if (entry) {
        try {
          const parsed = typeof entry === 'string' ? JSON.parse(entry) : entry;
          const s = parseStationEntry(parsed);
          if (s) {
            s.station = stationMap[s.code] ?? { code: s.code };
            stationEntries.push(s);
          }
        } catch {
          // skip malformed entries
        }
      }
    }

    const train = {
      id: p.TrainNum,
      number: parseInt(p.TrainNum, 10),
      route: p.RouteName ?? '',
      heading: p.Heading ?? '',
      velocity: parseFloat(p.Velocity ?? 0),
      lat: parseFloat(feature.geometry?.coordinates?.[1] ?? 0),
      lon: parseFloat(feature.geometry?.coordinates?.[0] ?? 0),
      state: p.TrainState ?? 'Unknown',
      serviceDisrupted: p.StatusMsg?.toLowerCase().includes('cancel') ||
                        p.StatusMsg?.toLowerCase().includes('disrupt') || false,
      statusMsg: p.StatusMsg ?? '',
      updatedAt: new Date().toISOString(),
      stations: stationEntries,
      delayMinutes: 0,
      _raw: p,
    };

    // Mark the first scheduled station after all departed ones as 'enroute'
    if (train.state === 'Active') {
      const firstScheduled = train.stations.findIndex((s) => s.status === 'scheduled');
      if (firstScheduled > 0) {
        train.stations[firstScheduled].status = 'enroute';
      }
    }

    train.delayMinutes = parseDelayMinutes(train);
    trains.push(train);
  }

  return trains;
}

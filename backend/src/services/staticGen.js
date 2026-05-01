import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SNAPSHOTS_DIR = path.join(__dirname, '../../public/snapshots');

// Shared nav — matches React Navbar exactly (same colors, font sizes, links)
export const NAV_HTML = `
<nav style="background:#003876;color:#fff;box-shadow:0 2px 8px rgba(0,0,0,.15)">
  <div style="max-width:1280px;margin:0 auto;padding:12px 16px;display:flex;align-items:center;justify-content:space-between">
    <a href="/" style="display:flex;align-items:center;gap:8px;font-size:1.25rem;font-weight:700;letter-spacing:-.01em;color:#fff;text-decoration:none">
      <span style="font-size:1.5rem">🚆</span>
      Amtrak Tracker
    </a>
    <div style="display:flex;align-items:center;gap:16px;font-size:.875rem" id="nav-links">
      <a href="/board"      style="color:#bfdbfe;text-decoration:none" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='#bfdbfe'">Live Board</a>
      <a href="/schedule"   style="color:#bfdbfe;text-decoration:none" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='#bfdbfe'">Search</a>
      <span id="nav-auth">
        <a href="/login"    style="color:#bfdbfe;text-decoration:none;margin-right:12px" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='#bfdbfe'">Sign In</a>
        <a href="/register" style="background:#c0392b;color:#fff;padding:4px 12px;border-radius:4px;font-size:.875rem;text-decoration:none">Sign Up</a>
      </span>
    </div>
  </div>
</nav>
<script>
  (function() {
    const token = localStorage.getItem('token');
    if (!token) return;
    fetch('/api/auth/me', { headers: { Authorization: 'Bearer ' + token } })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data?.user) return;
        const el = document.getElementById('nav-auth');
        const isAdmin = data.user.role === 'admin';
        el.innerHTML =
          '<a href="/dashboard" style="color:#bfdbfe;text-decoration:none;margin-right:4px">My Trains</a>'
          + (isAdmin ? ' <a href="/admin" style="color:#bfdbfe;text-decoration:none;margin-right:4px">Admin</a>' : '')
          + ' <span style="color:#93c5fd;margin:0 4px">|</span>'
          + ' <span style="color:#bfdbfe">' + data.user.name + '</span>'
          + ' <button onclick="doLogout()" style="background:#c0392b;color:#fff;border:none;padding:4px 12px;border-radius:4px;font-size:.875rem;cursor:pointer;margin-left:8px">Logout</button>';
      })
      .catch(() => {});
  })();
  function doLogout() { localStorage.removeItem('token'); location.reload(); }
</script>`;

const TZ_MAP = {
  P: 'America/Los_Angeles',
  M: 'America/Denver',
  C: 'America/Chicago',
  E: 'America/New_York',
};

const TZ_LABELS = { P: 'PT', M: 'MT', C: 'CT', E: 'ET' };

// Times are formatted client-side so they are never affected by server ICU/timezone config.
// stationRow embeds raw ISO strings as data-* attributes; formatStationTimes() in the page
// script reads them and fills the .times span for each row.
function stationRow(s, prevTz) {
  const isDeparted = s.status === 'departed';
  const isArrived  = s.status === 'arrived';
  const isEnroute  = s.status === 'enroute';
  const isPast     = isDeparted || isArrived;

  const realArr = isPast ? (s.actualArrival  || s.estimatedArrival)  : s.estimatedArrival;
  const realDep = isPast ? (s.actualDeparture || s.estimatedDeparture) : s.estimatedDeparture;

  const arrDelay = s.scheduledArrival && realArr
    ? Math.round((new Date(realArr) - new Date(s.scheduledArrival)) / 60000) : 0;
  const depDelay = s.scheduledDeparture && realDep
    ? Math.round((new Date(realDep) - new Date(s.scheduledDeparture)) / 60000) : 0;
  const wasLate = arrDelay > 5 || depDelay > 5;

  const dotColor  = isPast && wasLate ? '#ef4444' : isPast ? '#22c55e' : isEnroute ? '#3b82f6' : '#d1d5db';
  const rowBg     = isEnroute ? '#eff6ff' : isPast && wasLate ? '#fef2f2' : isPast ? '#f0fdf4' : 'transparent';
  const nameColor = isEnroute ? '#003876' : isPast && wasLate ? '#b91c1c' : isPast ? '#15803d' : '#9ca3af';
  const nameFw    = isPast || isEnroute ? 'bold' : 'normal';

  const pill = isEnroute
    ? `<span class="pill pill-blue">● En Route — Next Stop</span>`
    : isDeparted && wasLate ? `<span class="pill pill-red">✓ Departed Late</span>`
    : isDeparted            ? `<span class="pill pill-green">✓ Departed</span>`
    : isArrived  && wasLate ? `<span class="pill pill-red">✓ Arrived Late</span>`
    : isArrived             ? `<span class="pill pill-green">✓ Arrived</span>`
    :                         `<span class="pill pill-gray">Scheduled</span>`;

  const tzDivider = (prevTz && s.tz && prevTz !== s.tz)
    ? `<div style="display:flex;align-items:center;gap:8px;margin:4px 0;padding:0 8px"><div style="flex:1;height:1px;background:#e5e7eb"></div><span style="font-size:.7rem;color:#6b7280;font-weight:600;white-space:nowrap">${TZ_LABELS[prevTz] || prevTz} → ${TZ_LABELS[s.tz] || s.tz}</span><div style="flex:1;height:1px;background:#e5e7eb"></div></div>`
    : '';

  // Embed ISO timestamps and delay values as data attributes; client JS formats them
  return `${tzDivider}
    <div class="station-row" style="background:${rowBg}"
      data-tz="${s.tz || 'P'}"
      data-sched-arr="${s.scheduledArrival || ''}"
      data-sched-dep="${s.scheduledDeparture || ''}"
      data-real-arr="${realArr || ''}"
      data-real-dep="${realDep || ''}"
      data-arr-delay="${arrDelay}"
      data-dep-delay="${depDelay}">
      <div class="dot-col">
        <span class="dot" style="background:${dotColor}${isEnroute ? ';box-shadow:0 0 0 3px #bfdbfe' : ''}"></span>
      </div>
      <div class="station-body">
        <div class="station-top">
          <span class="station-name" style="color:${nameColor};font-weight:${nameFw}${isEnroute ? ';font-size:1rem' : ''}">
            ${s.station?.name && s.code ? `<span style="color:#111827;font-weight:400">(${s.code})</span> ` : ''}${s.station?.name || s.code}${s.bus ? ' <span class="bus">(Bus)</span>' : ''}${s.tz ? ` <span style="font-size:.65rem;color:#9ca3af;font-weight:400">${TZ_LABELS[s.tz] || s.tz}</span>` : ''}
          </span>
          ${pill}
        </div>
        <div class="times">—</div>
      </div>
    </div>`;
}

function statusBadge(train) {
  if (train.serviceDisrupted)
    return `<span class="badge badge-red">⚠ Disrupted</span>`;
  if (train.state === 'Completed')
    return `<span class="badge badge-complete">✓ Complete</span>`;
  if (train.delayMinutes >= 15)
    return `<span class="badge badge-yellow">🕐 ${train.delayMinutes} min late</span>`;
  return `<span class="badge badge-green">✓ On Time</span>`;
}

export function generateTrainHTML(train, generatedAt) {

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Train ${train.number} — ${train.route} | Amtrak Tracker</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f9fafb;color:#111827}
    a{color:#003876;text-decoration:none} a:hover{text-decoration:underline}
    .container{max-width:800px;margin:0 auto;padding:24px 16px}
    .card{background:#fff;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,.08);padding:20px;margin-bottom:20px}
    .header-row{display:flex;flex-wrap:wrap;justify-content:space-between;gap:12px}
    h1{font-size:1.8rem;font-weight:800;color:#003876}
    .route{color:#6b7280;margin-top:4px}
    .meta{font-size:.8rem;color:#9ca3af;margin-top:8px}
    .meta strong{color:#6b7280}
    .badge{display:inline-block;padding:3px 10px;border-radius:999px;font-size:.8rem;font-weight:600;margin-top:8px}
    .badge-green{background:#dcfce7;color:#15803d}
    .badge-complete{background:#bbf7d0;color:#14532d;font-weight:700}
    .badge-yellow{background:#fef9c3;color:#92400e}
    .badge-red{background:#fee2e2;color:#b91c1c}
    .legend{display:flex;gap:16px;flex-wrap:wrap;font-size:.75rem;color:#6b7280;margin-bottom:14px;margin-top:10px}
    .legend span{display:flex;align-items:center;gap:5px}
    .track{position:relative}
    .track-line{position:absolute;left:10px;top:6px;bottom:6px;width:2px;background:#e5e7eb}
    .station-row{position:relative;display:flex;gap:12px;padding:10px 8px;border-radius:8px}
    .dot-col{flex-shrink:0;width:22px;display:flex;justify-content:center;padding-top:5px;position:relative;z-index:1}
    .dot{width:12px;height:12px;border-radius:50%;display:inline-block}
    .station-body{flex:1;min-width:0}
    .station-top{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px}
    .station-name{font-size:.9rem}
    .bus{font-size:.75rem;color:#f97316;font-weight:normal}
    .pill{display:inline-block;padding:2px 8px;border-radius:999px;font-size:.72rem;font-weight:600}
    .pill-blue{background:#dbeafe;color:#1d4ed8}
    .pill-green{background:#dcfce7;color:#15803d}
    .pill-red{background:#fee2e2;color:#b91c1c}
    .pill-gray{background:#f3f4f6;color:#9ca3af}
    .times{font-size:.75rem;color:#6b7280;margin-top:3px}
    .times strong{color:#374151}
    .late{color:#dc2626;font-weight:700}
    .early{color:#16a34a}
    .generated{font-size:.75rem;color:#9ca3af;text-align:center;padding:16px 0}
  </style>
</head>
<body>
  ${NAV_HTML}

  <div class="container">
    <div class="card">
      <div class="header-row">
        <div>
          <h1>Train ${train.number}</h1>
          <div class="route">${train.route || ''}</div>
          ${statusBadge(train)}
          ${train.statusMsg ? `<div class="meta" style="margin-top:6px"><em>${train.statusMsg}</em></div>` : ''}
        </div>
        <div style="text-align:right">
          <div class="meta">State: <strong>${train.state}</strong></div>
          <div class="meta">Speed: <strong>${Math.round(train.velocity || 0)} mph</strong></div>
          <div class="meta">Updated: <strong id="gen-time">—</strong></div>
          <div class="meta" style="margin-top:8px;font-size:.7rem;color:#d1d5db">Page refreshes every 2 min</div>
        </div>
      </div>
    </div>

    <div class="card">
      <h2 style="font-size:1rem;font-weight:600;color:#374151;margin-bottom:12px">Today's Schedule</h2>
      <div class="legend">
        <span><span class="dot" style="background:#22c55e"></span> Departed on time</span>
        <span><span class="dot" style="background:#ef4444"></span> Departed late (&gt;5m)</span>
        <span><span class="dot" style="background:#3b82f6;box-shadow:0 0 0 3px #bfdbfe"></span> En Route — next stop</span>
        <span><span class="dot" style="background:#d1d5db"></span> Scheduled</span>
      </div>
      ${train.stations?.length === 0
        ? '<p style="color:#9ca3af;font-size:.85rem">No station data available.</p>'
        : (() => {
            const stations = train.state === 'Completed'
              ? (train.stations || []).map(s => {
                  if (s.status !== 'scheduled') return s;
                  // For terminus stations with no actual arrival data, infer from
                  // scheduled time + train's overall delay so late/on-time is correct
                  const inferredActual = (!s.actualArrival && s.scheduledArrival && train.delayMinutes > 0)
                    ? new Date(new Date(s.scheduledArrival).getTime() + train.delayMinutes * 60000).toISOString()
                    : s.actualArrival;
                  return { ...s, status: 'arrived', actualArrival: inferredActual || s.estimatedArrival || s.scheduledArrival };
                })
              : (train.stations || []);
            return `<div class="track"><div class="track-line"></div>${stations.map((s, i, arr) => stationRow(s, arr[i - 1]?.tz)).join('')}</div>`;
          })()
      }
    </div>
  </div>

  <div class="generated">Checked: <span id="check-time"></span> &mdash; auto-refreshes every 2 minutes</div>

  <script>
    (function() {
      const TZ_MAP = { P:'America/Los_Angeles', M:'America/Denver', C:'America/Chicago', E:'America/New_York' };

      function fmtTime(iso, tz) {
        if (!iso) return null;
        return new Date(iso).toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit', timeZone: TZ_MAP[tz] || TZ_MAP.P });
      }

      document.querySelectorAll('.station-row[data-tz]').forEach(row => {
        const tz       = row.dataset.tz;
        const schedArr = row.dataset.schedArr;
        const schedDep = row.dataset.schedDep;
        const realArr  = row.dataset.realArr;
        const realDep  = row.dataset.realDep;
        const arrDelay = parseInt(row.dataset.arrDelay, 10);
        const depDelay = parseInt(row.dataset.depDelay, 10);

        function timePart(label, sched, real, delay) {
          const s = fmtTime(sched, tz);
          if (!s) return '';
          const delayStr = delay !== 0 ? ' (' + (delay > 0 ? '+' : '') + delay + 'm)' : '';
          const cls = delay > 5 ? 'late' : delay < 0 ? 'early' : '';
          const r = fmtTime(real, tz);
          const arrow = r && r !== s ? ' <span class="' + cls + '">&rarr; ' + r + delayStr + '</span>' : '';
          return label + ': <strong>' + s + '</strong>' + arrow;
        }

        const parts = [
          timePart('Arr', schedArr, realArr, arrDelay),
          timePart('Dep', schedDep, realDep, depDelay),
        ].filter(Boolean);
        row.querySelector('.times').innerHTML = parts.join(' &nbsp;|&nbsp; ') || '—';
      });

      const fmt = (d) => d.toLocaleString([], { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
      const snap = new Date('${new Date(generatedAt).toISOString()}');
      document.getElementById('gen-time').textContent  = fmt(snap);
      document.getElementById('check-time').textContent = fmt(new Date());
    })();
    setTimeout(() => location.reload(), 120000);
  </script>
</body>
</html>`;
}

export async function writeTrainSnapshots(trains, generatedAt) {
  await fs.mkdir(SNAPSHOTS_DIR, { recursive: true });
  await Promise.all([
    ...trains.map((train) => {
      const html = generateTrainHTML(train, generatedAt);
      return fs.writeFile(path.join(SNAPSHOTS_DIR, `${train.number}.html`), html, 'utf8');
    }),
    fs.writeFile(
      path.join(SNAPSHOTS_DIR, '../liveboard.html'),
      generateLiveBoardHTML(trains, generatedAt),
      'utf8',
    ),
  ]);
}

function generateLiveBoardHTML(trains, generatedAt) {

  const total     = trains.length;
  const onTime    = trains.filter(t => !t.serviceDisrupted && t.delayMinutes < 15).length;
  const delayed   = trains.filter(t => t.delayMinutes >= 15 && !t.serviceDisrupted).length;
  const disrupted = trains.filter(t => t.serviceDisrupted).length;

  // Group by route, sorted alphabetically, trains sorted by first station time
  const groups = {};
  trains.forEach(t => {
    const key = t.route || 'Unknown';
    if (!groups[key]) groups[key] = [];
    groups[key].push(t);
  });
  const getFirstTime = t => {
    const s = t.stations?.[0];
    const ts = s?.scheduledDeparture || s?.scheduledArrival;
    return ts ? new Date(ts).getTime() : Infinity;
  };
  const sorted = Object.entries(groups)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([route, rt]) => [route, [...rt].sort((a, b) => getFirstTime(a) - getFirstTime(b))]);

  const routeHTML = sorted.map(([route, routeTrains]) => {
    const issueCount = routeTrains.filter(t => t.serviceDisrupted || t.delayMinutes >= 15).length;
    const allIssues  = issueCount === routeTrains.length && routeTrains.length > 0;

    const headerBg   = allIssues ? '#fefce8' : '#003876';
    const headerColor = allIssues ? '#78350f' : '#fff';
    const issueBadge = issueCount > 0 && !allIssues
      ? `<span style="font-size:.72rem;font-weight:400;color:#fde68a;margin-left:8px">⚠ ${issueCount} with issues</span>`
      : allIssues
      ? `<span style="font-size:.72rem;font-weight:700;color:#92400e;margin-left:8px">⚠ All delayed/disrupted</span>`
      : '';

    const rows = routeTrains.map(t => {
      const isDisrupted = t.serviceDisrupted;
      const isDelayed   = t.delayMinutes >= 15;
      const rowBg = isDisrupted ? '#fef2f2' : isDelayed ? '#fefce8' : '#fff';
      const badge = isDisrupted
        ? `<span class="sbadge sbadge-red">Disrupted</span>`
        : isDelayed
        ? `<span class="sbadge sbadge-yellow">${t.delayMinutes}m late</span>`
        : `<span class="sbadge sbadge-green">On Time</span>`;
      return `
        <tr style="background:${rowBg};border-bottom:1px solid #f3f4f6">
          <td class="td"><a href="/trains/${t.number}" style="color:#003876;font-family:monospace;font-weight:700">${t.number}</a></td>
          <td class="td">${t.route || '—'}</td>
          <td class="td">${badge}</td>
          <td class="td" style="color:#6b7280;font-size:.8rem">${t.state}</td>
          <td class="td tdtrunc" style="color:#9ca3af;font-size:.8rem">${t.statusMsg || '—'}</td>
          <td class="td" style="font-size:.8rem">${Math.round(t.velocity || 0)} mph</td>
        </tr>`;
    }).join('');

    const routeId = route.replace(/\s+/g, '-');
    return `
      <div class="route-group" style="margin-bottom:12px;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08)">
        <button onclick="toggle('${routeId}')"
          style="width:100%;display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:${headerBg};color:${headerColor};font-weight:600;font-size:.85rem;border:none;cursor:pointer;text-align:left">
          <span>${route}<span style="font-weight:400;font-size:.75rem;margin-left:6px;opacity:.7">${routeTrains.length} train${routeTrains.length !== 1 ? 's' : ''}</span>${issueBadge}</span>
          <span id="arr-${routeId}" style="font-size:.9rem">▸</span>
        </button>
        <div id="${routeId}" style="display:none">
          <div style="overflow-x:auto">
            <table style="width:100%;border-collapse:collapse;background:#fff;font-size:.85rem">
              <thead style="background:#003876;color:#fff">
                <tr>
                  <th class="th">Train #</th><th class="th">Route</th><th class="th">Status</th>
                  <th class="th">State</th><th class="th">Message</th><th class="th">Speed</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>
      </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Live Train Board | Amtrak Tracker</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f9fafb;color:#111827}
    a{color:#003876;text-decoration:none} a:hover{text-decoration:underline}
    .container{max-width:1100px;margin:0 auto;padding:24px 16px}
    h1{font-size:1.6rem;font-weight:800;color:#003876}
    .subtitle{color:#9ca3af;font-size:.82rem;margin-top:4px}
    .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:20px 0}
    @media(max-width:600px){.stats{grid-template-columns:repeat(2,1fr)}}
    .stat{background:#fff;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,.08);padding:14px;text-align:center}
    .stat-val{font-size:2rem;font-weight:800}
    .stat-lbl{font-size:.75rem;color:#9ca3af;margin-top:2px}
    .filters{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:16px;align-items:center}
    .filters input{border:1px solid #e5e7eb;border-radius:8px;padding:7px 12px;font-size:.85rem;width:220px;outline:none}
    .filters input:focus{border-color:#003876}
    .fbtn{padding:6px 14px;border-radius:8px;font-size:.8rem;cursor:pointer;border:1px solid #e5e7eb;background:#fff;color:#6b7280}
    .fbtn.active{background:#003876;color:#fff;border-color:#003876}
    .sbadge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:.72rem;font-weight:600}
    .sbadge-green{background:#dcfce7;color:#15803d}
    .sbadge-yellow{background:#fef9c3;color:#92400e}
    .sbadge-red{background:#fee2e2;color:#b91c1c}
    .th{padding:10px 14px;text-align:left;font-size:.8rem;font-weight:600}
    .td{padding:10px 14px}
    .tdtrunc{max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .generated{font-size:.75rem;color:#9ca3af;text-align:center;padding:20px 0}
    .cta{background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:10px 14px;font-size:.82rem;color:#1e40af;margin-bottom:16px}
    .cta a{color:#1d4ed8;text-decoration:underline}
    #map{height:480px;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,.1);margin-bottom:24px}
    .map-legend{display:flex;gap:16px;font-size:.75rem;color:#6b7280;margin-bottom:16px;flex-wrap:wrap}
    .map-legend span{display:flex;align-items:center;gap:5px}
    .leg-dot{width:12px;height:12px;border-radius:50%;display:inline-block}
  </style>
</head>
<body>
  ${NAV_HTML}

  <div class="container">
    <div style="margin-bottom:20px">
      <h1>Live Train Board</h1>
      <div class="subtitle">Generated: <span id="gen-time">—</span> — auto-refreshes every 2 minutes</div>
    </div>

    <div class="stats">
      <div class="stat"><div class="stat-val" style="color:#003876">${total}</div><div class="stat-lbl">Active Trains</div></div>
      <div class="stat"><div class="stat-val" style="color:#16a34a">${onTime}</div><div class="stat-lbl">On Time</div></div>
      <div class="stat"><div class="stat-val" style="color:#ca8a04">${delayed}</div><div class="stat-lbl">Delayed</div></div>
      <div class="stat"><div class="stat-val" style="color:#dc2626">${disrupted}</div><div class="stat-lbl">Disrupted</div></div>
    </div>

    <div class="map-legend">
      <span><span class="leg-dot" style="background:#dc2626"></span> Delayed / Disrupted</span>
      <span><span class="leg-dot" style="background:#003876"></span> On Time</span>
    </div>
    <div id="map"></div>

    <div class="cta">
      <strong>Want delay alerts?</strong> <a href="/register">Create a free account</a> to subscribe to specific trains.
    </div>

    <div class="filters">
      <input type="text" id="search" placeholder="Search train # or route..." oninput="filterRoutes()">
      <button class="fbtn active" id="f-all"      onclick="setFilter('all')">All</button>
      <button class="fbtn"        id="f-ontime"   onclick="setFilter('ontime')">On Time</button>
      <button class="fbtn"        id="f-delayed"  onclick="setFilter('delayed')">Delayed</button>
      <button class="fbtn"        id="f-disrupted" onclick="setFilter('disrupted')">Disrupted</button>
    </div>

    <div id="routes">${routeHTML}</div>
  </div>

  <div class="generated">Checked: <span id="check-time"></span> &mdash; auto-refreshes every 2 minutes</div>

  <script>
    (function() {
      const fmt = (d) => d.toLocaleString([], { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
      const snap = new Date('${new Date(generatedAt).toISOString()}');
      document.getElementById('gen-time').textContent   = fmt(snap);
      document.getElementById('check-time').textContent = fmt(new Date());
    })();

    let activeFilter = 'all';

    // Embed train data for client-side filtering
    const trainData = ${JSON.stringify(trains.map(t => ({
      number: t.number,
      route: t.route || '',
      delayed: t.delayMinutes >= 15,
      disrupted: t.serviceDisrupted,
    })))};

    // Embed map data — current position + station route coords
    const mapTrains = ${JSON.stringify(trains
      .filter(t => t.lat && t.lon)
      .map(t => ({
        number: t.number,
        route: t.route || '',
        lat: t.lat,
        lon: t.lon,
        delayed: t.delayMinutes >= 15 || t.serviceDisrupted,
        delayMinutes: t.delayMinutes,
        disrupted: t.serviceDisrupted,
        statusMsg: t.statusMsg || '',
        velocity: Math.round(t.velocity || 0),
        routeCoords: (t.stations || [])
          .filter(s => s.station?.lat && s.station?.lon)
          .map(s => [s.station.lat, s.station.lon]),
      }))
    )};

    (function initMap() {
      const map = L.map('map', { zoomControl: true }).setView([39.5, -98.35], 4);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 18,
      }).addTo(map);

      mapTrains.forEach(t => {
        const color = t.delayed ? '#dc2626' : '#003876';

        // Route polyline — dark red track line
        if (t.routeCoords.length > 1) {
          L.polyline(t.routeCoords, { color: '#8b0000', weight: 3, opacity: 0.85 }).addTo(map);

          // Small white circle for each station stop
          t.routeCoords.forEach(coord => {
            L.circleMarker(coord, {
              radius: 4,
              color: '#8b0000',
              weight: 1.5,
              fillColor: '#fff',
              fillOpacity: 1,
            }).addTo(map);
          });
        }

        // Train position marker
        const icon = L.divIcon({
          className: '',
          html: '<div style="background:' + color + ';color:#fff;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)">' + t.number + '</div>',
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });

        const statusLine = t.disrupted ? '⚠ Disrupted'
          : t.delayMinutes >= 15 ? '🕐 ' + t.delayMinutes + ' min late'
          : '✓ On Time';
        const popup = '<b><a href="/trains/' + t.number + '" style="color:#003876">Train ' + t.number + '</a></b>'
          + '<br>' + t.route
          + '<br>' + statusLine
          + (t.velocity ? '<br>' + t.velocity + ' mph' : '')
          + (t.statusMsg ? '<br><em style="font-size:.8em;color:#6b7280">' + t.statusMsg + '</em>' : '');

        L.marker([t.lat, t.lon], { icon }).addTo(map).bindPopup(popup);
      });
    })();

    function toggle(id) {
      const el = document.getElementById(id);
      const arr = document.getElementById('arr-' + id);
      const open = el.style.display === 'none';
      el.style.display = open ? 'block' : 'none';
      arr.textContent = open ? '▾' : '▸';
    }

    function setFilter(f) {
      activeFilter = f;
      document.querySelectorAll('.fbtn').forEach(b => b.classList.remove('active'));
      document.getElementById('f-' + f).classList.add('active');
      filterRoutes();
    }

    function filterRoutes() {
      const q = document.getElementById('search').value.toLowerCase();
      document.querySelectorAll('.route-group').forEach(group => {
        const btn   = group.querySelector('button');
        const route = btn.textContent.trim().split(/\\s{2,}/)[0].toLowerCase();
        const rows  = group.querySelectorAll('tbody tr');
        let visible = 0;
        rows.forEach(row => {
          const num   = row.cells[0].textContent.trim();
          const rt    = row.cells[1].textContent.trim().toLowerCase();
          const match = !q || num.includes(q) || rt.includes(q);
          const train = trainData.find(t => String(t.number) === num);
          const fmatch = activeFilter === 'all'
            || (activeFilter === 'ontime'    && train && !train.delayed && !train.disrupted)
            || (activeFilter === 'delayed'   && train && train.delayed)
            || (activeFilter === 'disrupted' && train && train.disrupted);
          row.style.display = match && fmatch ? '' : 'none';
          if (match && fmatch) visible++;
        });
        group.style.display = visible > 0 ? '' : 'none';
      });
    }

    // Auto-reload every 2 minutes to get fresh snapshot
    setTimeout(() => location.reload(), 120000);
  </script>
</body>
</html>`;
}

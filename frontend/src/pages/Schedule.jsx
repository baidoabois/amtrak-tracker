import { useState, useEffect, useRef } from 'react';
import api from '../api.js';

function StationInput({ label, value, onChange, stations }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef();

  useEffect(() => {
    if (value) {
      const s = stations.find(s => s.code === value);
      if (s) setQuery(`${s.name} (${s.code})`);
    }
  }, [value, stations]);

  useEffect(() => {
    const handler = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = query.length < 1 ? [] : stations.filter(s =>
    s.name.toLowerCase().includes(query.toLowerCase()) ||
    s.code.toLowerCase().includes(query.toLowerCase())
  ).slice(0, 8);

  const select = (s) => {
    onChange(s.code);
    setQuery(`${s.name} (${s.code})`);
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type="text"
        value={query}
        onChange={e => { setQuery(e.target.value); onChange(''); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Type station name or code..."
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-600"
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-10 w-full bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-52 overflow-y-auto">
          {filtered.map(s => (
            <li
              key={s.code}
              onMouseDown={() => select(s)}
              className="px-3 py-2 text-sm hover:bg-blue-50 cursor-pointer flex justify-between"
            >
              <span>{s.name}</span>
              <span className="text-gray-400 font-mono text-xs">{s.code}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function tzLabel(ianaOrCode) {
  if (!ianaOrCode) return '';
  const map = {
    'America/Los_Angeles': 'PT', 'America/Denver': 'MT',
    'America/Chicago': 'CT', 'America/New_York': 'ET',
    'America/Phoenix': 'MT',
  };
  return map[ianaOrCode] || ianaOrCode.split('/').pop().replace(/_/g, ' ');
}

function duration(mins) {
  if (!mins || mins <= 0) return '';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function Schedule() {
  const [stations, setStations] = useState([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [date, setDate] = useState(() => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' }));
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [stationsLoading, setStationsLoading] = useState(true);

  useEffect(() => {
    api.get('/schedule/stations')
      .then(({ data }) => setStations(data.stations))
      .catch(() => setError('Failed to load station list.'))
      .finally(() => setStationsLoading(false));
  }, []);

  const maxDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toLocaleDateString('en-CA');
  })();

  const search = async (e) => {
    e.preventDefault();
    if (!from) { setError('Please select a departure station.'); return; }
    if (!to)   { setError('Please select an arrival station.'); return; }
    if (from === to) { setError('Departure and arrival stations must be different.'); return; }
    setError('');
    setLoading(true);
    setResults(null);
    try {
      const { data } = await api.get('/schedule/search', { params: { from, to, date } });
      setResults(data.results);
    } catch (err) {
      setError(err.response?.data?.message || 'Search failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-amtrak-blue">Schedule Search</h1>
        <p className="text-gray-500 text-sm mt-1">Find Amtrak trains between any two stations for the next 7 days.</p>
      </div>

      <form onSubmit={search} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
        {stationsLoading ? (
          <p className="text-sm text-gray-400">Loading stations...</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
            <StationInput label="From" value={from} onChange={setFrom} stations={stations} />
            <StationInput label="To"   value={to}   onChange={setTo}   stations={stations} />

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input
                type="date"
                value={date}
                min={new Date().toLocaleDateString('en-CA')}
                max={maxDate}
                onChange={e => setDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-600"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="bg-amtrak-blue hover:bg-blue-900 text-white font-semibold px-6 py-2 rounded-lg text-sm transition-colors disabled:opacity-50"
            >
              {loading ? 'Searching...' : 'Search'}
            </button>
          </div>
        )}
        {error && <p className="text-red-600 text-sm mt-3">{error}</p>}
      </form>

      {loading && (
        <div className="text-center py-12 text-gray-400 text-sm">
          Loading schedule data — first search may take ~30 seconds while the GTFS feed downloads...
        </div>
      )}

      {results !== null && !loading && (
        <div>
          <p className="text-sm text-gray-500 mb-3">
            {results.length === 0
              ? 'No trains found between these stations on this date.'
              : `${results.length} train${results.length !== 1 ? 's' : ''} found`}
          </p>

          {results.length > 0 && (
            <div className="space-y-3">
              {results.map((r) => (
                <div key={r.tripId} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex flex-wrap items-center gap-4 justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <a
                        href={`/trains/${r.trainNumber}`}
                        className="font-mono font-bold text-amtrak-blue text-lg hover:underline"
                      >
                        {r.trainNumber}
                      </a>
                      <span className="text-gray-500 text-sm">{r.routeName}</span>
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">{date}</div>
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="text-center">
                      <div className="text-lg font-bold text-gray-800">{r.departureFmt}</div>
                      <div className="text-xs text-gray-400">{r.fromStopName}</div>
                      {r.fromTz && <div className="text-xs text-gray-300 font-mono">{tzLabel(r.fromTz)}</div>}
                    </div>

                    <div className="text-center">
                      <div className="text-xs text-gray-400 mb-0.5">{duration(r.durationMins)}</div>
                      <div className="flex items-center gap-1">
                        <div className="w-8 h-px bg-gray-300"></div>
                        <span className="text-gray-300 text-xs">✈</span>
                        <div className="w-8 h-px bg-gray-300"></div>
                      </div>
                    </div>

                    <div className="text-center">
                      <div className="text-lg font-bold text-gray-800">{r.arrivalFmt}</div>
                      <div className="text-xs text-gray-400">{r.toStopName}</div>
                      {r.toTz && <div className="text-xs text-gray-300 font-mono">{tzLabel(r.toTz)}</div>}
                    </div>
                  </div>

                  <a
                    href={`/trains/${r.trainNumber}`}
                    className="text-xs bg-blue-50 hover:bg-blue-100 text-amtrak-blue px-3 py-1.5 rounded-lg font-medium transition-colors"
                  >
                    Live Status →
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

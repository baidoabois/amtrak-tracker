import { useState, useMemo, useEffect } from 'react';
import { useTrains } from '../hooks/useTrains.js';
import TrainTable from '../components/TrainTable.jsx';
import api from '../api.js';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line,
} from 'recharts';

const COLORS = ['#22c55e', '#eab308', '#ef4444'];

// ── Live tab ─────────────────────────────────────────────────────────────────

function LiveTab({ trains, lastUpdated, loading, error }) {
  const stats = useMemo(() => {
    const onTime = trains.filter((t) => !t.serviceDisrupted && t.delayMinutes < 15).length;
    const delayed = trains.filter((t) => t.delayMinutes >= 15 && !t.serviceDisrupted).length;
    const disrupted = trains.filter((t) => t.serviceDisrupted).length;
    return { onTime, delayed, disrupted };
  }, [trains]);

  const pieData = [
    { name: 'On Time', value: stats.onTime },
    { name: 'Delayed', value: stats.delayed },
    { name: 'Disrupted', value: stats.disrupted },
  ];

  const routeData = useMemo(() => {
    const byRoute = {};
    trains.forEach((t) => {
      const key = t.route || 'Unknown';
      if (!byRoute[key]) byRoute[key] = { route: key, total: 0, delayed: 0 };
      byRoute[key].total++;
      if (t.delayMinutes >= 15 || t.serviceDisrupted) byRoute[key].delayed++;
    });
    return Object.values(byRoute).sort((a, b) => b.total - a.total).slice(0, 15);
  }, [trains]);

  const [view, setView] = useState('table');

  if (loading) return <div className="text-center py-16 text-gray-400">Loading...</div>;
  if (error) return <div className="text-center py-16 text-red-500">{error}</div>;

  return (
    <>
      <div className="flex justify-end mb-4 gap-2">
        {['table', 'charts'].map((v) => (
          <button key={v} onClick={() => setView(v)}
            className={`px-4 py-2 rounded-lg text-sm transition-colors ${view === v ? 'bg-amtrak-blue text-white' : 'bg-white border text-gray-600 hover:bg-gray-50'}`}>
            {v.charAt(0).toUpperCase() + v.slice(1)}
          </button>
        ))}
      </div>

      {view === 'table' ? (
        <TrainTable trains={trains} showSubscribeColumn={false} />
      ) : (
        <div className="grid md:grid-cols-2 gap-8">
          <div className="bg-white rounded-xl shadow p-6">
            <h3 className="font-semibold text-gray-700 mb-4">Status Breakdown</h3>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                  {pieData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                </Pie>
                <Tooltip /><Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-white rounded-xl shadow p-6">
            <h3 className="font-semibold text-gray-700 mb-4">Trains by Route (top 15)</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={routeData} layout="vertical" margin={{ left: 80 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" /><YAxis type="category" dataKey="route" tick={{ fontSize: 11 }} width={80} />
                <Tooltip />
                <Bar dataKey="total" fill="#003876" name="Total" />
                <Bar dataKey="delayed" fill="#ef4444" name="Delayed/Disrupted" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </>
  );
}

// ── History tab ───────────────────────────────────────────────────────────────

function HistoryTab() {
  const [dates, setDates] = useState([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [trainSearch, setTrainSearch] = useState('');
  const [records, setRecords] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [trainHistory, setTrainHistory] = useState([]);
  const [drillTrain, setDrillTrain] = useState('');

  useEffect(() => {
    api.get('/history/dates').then(({ data }) => {
      setDates(data.dates);
      if (data.dates.length > 0) setSelectedDate(data.dates[0]);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedDate) return;
    setLoading(true);
    api.get('/history', { params: { date: selectedDate, limit: 200 } })
      .then(({ data }) => { setRecords(data.records); setTotal(data.total); })
      .finally(() => setLoading(false));
  }, [selectedDate]);

  const handleDrillDown = (trainNumber) => {
    setDrillTrain(trainNumber);
    api.get(`/history/${trainNumber}`).then(({ data }) => setTrainHistory(data.records));
  };

  const filtered = useMemo(() =>
    records.filter((r) => !trainSearch || r.trainNumber.includes(trainSearch) || r.route?.toLowerCase().includes(trainSearch.toLowerCase())),
    [records, trainSearch],
  );

  // For the drilldown chart — last 30 finalized days
  const chartData = trainHistory.filter((r) => r.finalized).slice(0, 30).reverse().map((r) => ({
    date: r.date.slice(5), // MM-DD
    delay: r.delayMinutes,
    peak: r.peakDelayMinutes,
  }));

  return (
    <div>
      {/* Drill-down modal */}
      {drillTrain && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-amtrak-blue text-lg">Train {drillTrain} — Delay History</h3>
              <button onClick={() => setDrillTrain('')} className="text-gray-400 hover:text-gray-700 text-2xl">×</button>
            </div>
            {chartData.length === 0 ? (
              <p className="text-gray-400 text-sm">Not enough finalized data yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis unit="m" />
                  <Tooltip formatter={(v) => `${v} min`} />
                  <Legend />
                  <Line type="monotone" dataKey="delay" stroke="#003876" name="Final delay" dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="peak" stroke="#ef4444" name="Peak delay" dot={false} strokeWidth={2} strokeDasharray="4 2" />
                </LineChart>
              </ResponsiveContainer>
            )}
            <div className="mt-4 max-h-52 overflow-y-auto">
              <table className="min-w-full text-xs">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    {['Date', 'Final Delay', 'Peak Delay', 'Disrupted', 'State', 'Status'].map((h) => (
                      <th key={h} className="px-3 py-2 text-left text-gray-500 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {trainHistory.map((r) => (
                    <tr key={r._id} className={r.finalized ? '' : 'bg-yellow-50'}>
                      <td className="px-3 py-1.5 font-mono">{r.date}</td>
                      <td className={`px-3 py-1.5 font-medium ${r.delayMinutes >= 15 ? 'text-red-600' : 'text-green-600'}`}>
                        {r.delayMinutes ?? 0}m
                      </td>
                      <td className={`px-3 py-1.5 ${r.peakDelayMinutes >= 15 ? 'text-orange-600' : 'text-gray-600'}`}>
                        {r.peakDelayMinutes ?? 0}m
                      </td>
                      <td className="px-3 py-1.5">{r.serviceDisrupted ? '⚠ Yes' : '—'}</td>
                      <td className="px-3 py-1.5 text-gray-500">{r.state}</td>
                      <td className="px-3 py-1.5 text-gray-400 truncate max-w-[160px]">{r.statusMsg || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <div>
          <label className="block text-xs text-gray-500 mb-1">PST Date</label>
          <select
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amtrak-blue"
          >
            {dates.length === 0 && <option>No data yet</option>}
            {dates.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Filter train / route</label>
          <input
            type="text"
            placeholder="e.g. 774 or Surfliner"
            value={trainSearch}
            onChange={(e) => setTrainSearch(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-amtrak-blue"
          />
        </div>
        <div className="text-sm text-gray-400 mt-4">
          {total} trains on {selectedDate}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading history...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">No records found</div>
      ) : (
        <div className="overflow-x-auto rounded-lg shadow">
          <table className="min-w-full bg-white text-sm">
            <thead className="bg-amtrak-blue text-white">
              <tr>
                {['Train #', 'Route', 'Final Delay', 'Peak Delay', 'Disrupted', 'State', 'Last Updated', 'Finalized', ''].map((h) => (
                  <th key={h} className="px-4 py-3 text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((r) => (
                <tr key={r._id} className={`hover:bg-blue-50 transition-colors ${r.serviceDisrupted ? 'bg-red-50' : r.delayMinutes >= 15 ? 'bg-yellow-50' : ''}`}>
                  <td className="px-4 py-3 font-mono font-semibold text-amtrak-blue">{r.trainNumber}</td>
                  <td className="px-4 py-3">{r.route || '—'}</td>
                  <td className={`px-4 py-3 font-medium ${r.delayMinutes >= 15 ? 'text-red-600' : 'text-green-600'}`}>
                    {r.delayMinutes >= 15 ? `+${r.delayMinutes}m` : 'On time'}
                  </td>
                  <td className={`px-4 py-3 ${r.peakDelayMinutes >= 15 ? 'text-orange-600 font-medium' : 'text-gray-500'}`}>
                    {r.peakDelayMinutes > 0 ? `+${r.peakDelayMinutes}m` : '—'}
                  </td>
                  <td className="px-4 py-3">{r.serviceDisrupted ? <span className="text-red-600 font-medium">⚠ Yes</span> : '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{r.state}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {r.lastUpdatedAt ? new Date(r.lastUpdatedAt).toLocaleTimeString() : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {r.finalized
                      ? <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700">Final</span>
                      : <span className="px-2 py-0.5 rounded-full text-xs bg-yellow-100 text-yellow-700">In progress</span>}
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => handleDrillDown(r.trainNumber)}
                      className="text-xs text-amtrak-blue hover:underline">History</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Main AdminPanel ───────────────────────────────────────────────────────────

export default function AdminPanel() {
  const { trains, lastUpdated, loading, error } = useTrains(120000);
  const [tab, setTab] = useState('live');

  const stats = useMemo(() => ({
    total: trains.length,
    onTime: trains.filter((t) => !t.serviceDisrupted && t.delayMinutes < 15).length,
    delayed: trains.filter((t) => t.delayMinutes >= 15).length,
    disrupted: trains.filter((t) => t.serviceDisrupted).length,
  }), [trains]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-amtrak-blue">Admin Panel</h1>
          <p className="text-sm text-gray-500 mt-1">
            {lastUpdated ? `Live data as of ${new Date(lastUpdated).toLocaleTimeString()}` : 'Loading...'}
          </p>
        </div>
        <div className="flex gap-2">
          {['live', 'history'].map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg text-sm transition-colors ${tab === t ? 'bg-amtrak-blue text-white' : 'bg-white border text-gray-600 hover:bg-gray-50'}`}>
              {t === 'live' ? 'Live' : 'History'}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards — always visible */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Active Now', value: stats.total, color: 'text-amtrak-blue' },
          { label: 'On Time', value: stats.onTime, color: 'text-green-600' },
          { label: 'Delayed ≥15m', value: stats.delayed, color: 'text-yellow-600' },
          { label: 'Disrupted', value: stats.disrupted, color: 'text-red-600' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-lg shadow p-4 text-center">
            <div className={`text-3xl font-bold ${color}`}>{value}</div>
            <div className="text-sm text-gray-500 mt-1">{label}</div>
          </div>
        ))}
      </div>

      {tab === 'live'
        ? <LiveTab trains={trains} lastUpdated={lastUpdated} loading={loading} error={error} />
        : <HistoryTab />}
    </div>
  );
}

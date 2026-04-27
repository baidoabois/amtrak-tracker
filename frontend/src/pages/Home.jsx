import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useTrains } from '../hooks/useTrains.js';
import TrainTable from '../components/TrainTable.jsx';
import api from '../api.js';

export default function Home() {
  const { user } = useAuth();
  const { trains, lastUpdated, loading, error } = useTrains(120000);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [subscriptions, setSubscriptions] = useState([]);
  const navigate = useNavigate();

  // Load user subscriptions if logged in
  useMemo(() => {
    if (user) {
      api.get('/subscriptions').then(({ data }) => setSubscriptions(data.subscriptions)).catch(() => {});
    }
  }, [user]);

  const [collapsedRoutes, setCollapsedRoutes] = useState({ __default: true });

  const toggleRoute = (route) =>
    setCollapsedRoutes((prev) => ({ ...prev, [route]: !(prev[route] ?? true) }));

  const filtered = useMemo(() => {
    return trains.filter((t) => {
      const matchSearch =
        !search ||
        String(t.number).includes(search) ||
        t.route.toLowerCase().includes(search.toLowerCase());

      const matchFilter =
        filterStatus === 'all' ||
        (filterStatus === 'delayed' && t.delayMinutes >= 15) ||
        (filterStatus === 'disrupted' && t.serviceDisrupted) ||
        (filterStatus === 'ontime' && !t.serviceDisrupted && t.delayMinutes < 15);

      return matchSearch && matchFilter;
    });
  }, [trains, search, filterStatus]);

  const groupedByRoute = useMemo(() => {
    const groups = {};
    filtered.forEach((t) => {
      const key = t.route || 'Unknown';
      if (!groups[key]) groups[key] = [];
      groups[key].push(t);
    });

    // Within each route, sort by the first station's scheduled departure or arrival (earliest first)
    const getFirstStopTime = (train) => {
      const first = train.stations?.[0];
      if (!first) return Infinity;
      const t = first.scheduledDeparture || first.scheduledArrival;
      return t ? new Date(t).getTime() : Infinity;
    };

    return Object.entries(groups)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([route, routeTrains]) => [
        route,
        [...routeTrains].sort((a, b) => getFirstStopTime(a) - getFirstStopTime(b)),
      ]);
  }, [filtered]);

  const stats = useMemo(() => ({
    total: trains.length,
    delayed: trains.filter((t) => t.delayMinutes >= 15).length,
    disrupted: trains.filter((t) => t.serviceDisrupted).length,
    onTime: trains.filter((t) => !t.serviceDisrupted && t.delayMinutes < 15).length,
  }), [trains]);

  const handleSubscribeToggle = async (train) => {
    if (!user) { navigate('/register'); return; }
    const existing = subscriptions.find((s) => s.trainNumber === String(train.number));
    try {
      if (existing) {
        const { data } = await api.delete(`/subscriptions/${existing._id}`);
        setSubscriptions(data.subscriptions);
      } else {
        const { data } = await api.post('/subscriptions', {
          trainNumber: String(train.number),
          trainName: train.route,
        });
        setSubscriptions(data.subscriptions);
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Action failed');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-amtrak-blue">Live Train Board</h1>
        <p className="text-gray-500 text-sm mt-1">
          {lastUpdated
            ? `Last updated: ${new Date(lastUpdated).toLocaleTimeString()} — refreshes every 2 minutes`
            : 'Loading train data...'}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Active Trains', value: stats.total, color: 'text-amtrak-blue' },
          { label: 'On Time', value: stats.onTime, color: 'text-green-600' },
          { label: 'Delayed', value: stats.delayed, color: 'text-yellow-600' },
          { label: 'Disrupted', value: stats.disrupted, color: 'text-red-600' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-lg shadow p-4 text-center">
            <div className={`text-3xl font-bold ${color}`}>{value}</div>
            <div className="text-sm text-gray-500 mt-1">{label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <input
          type="text"
          placeholder="Search train # or route..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-amtrak-blue"
        />
        <div className="flex gap-2">
          {['all', 'ontime', 'delayed', 'disrupted'].map((f) => (
            <button
              key={f}
              onClick={() => setFilterStatus(f)}
              className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                filterStatus === f
                  ? 'bg-amtrak-blue text-white'
                  : 'bg-white border text-gray-600 hover:bg-gray-50'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Subscribe CTA */}
      {!user && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
          <strong>Want delay notifications?</strong>{' '}
          <a href="/register" className="underline">Create a free account</a> to subscribe to specific trains.
        </div>
      )}

      {/* Grouped tables by route */}
      {loading ? (
        <div className="text-center py-16 text-gray-400">Fetching live Amtrak data...</div>
      ) : error ? (
        <div className="text-center py-16 text-red-500">{error}</div>
      ) : groupedByRoute.length === 0 ? (
        <div className="text-center py-16 text-gray-400">No trains match your filters</div>
      ) : (
        <div className="space-y-4">
          {groupedByRoute.map(([route, routeTrains]) => {
            const collapsed = collapsedRoutes[route] ?? true;
            const issueCount = routeTrains.filter((t) => t.serviceDisrupted || t.delayMinutes >= 15).length;
            const allIssues = issueCount === routeTrains.length && routeTrains.length > 0;
            return (
              <div key={route} className="rounded-lg overflow-hidden shadow">
                {/* Route header stays blue unless every single train has an issue */}
                <button
                  onClick={() => toggleRoute(route)}
                  className={`w-full flex items-center justify-between px-4 py-3 text-left font-semibold text-sm transition-colors ${
                    allIssues ? 'bg-yellow-50 border-l-4 border-yellow-400' : 'bg-amtrak-blue'
                  }`}
                >
                  <span className={allIssues ? 'text-gray-800' : 'text-white'}>
                    {route}
                    <span className={`ml-2 font-normal text-xs ${allIssues ? 'text-gray-500' : 'text-blue-200'}`}>
                      {routeTrains.length} train{routeTrains.length !== 1 ? 's' : ''}
                    </span>
                    {issueCount > 0 && !allIssues && (
                      <span className="ml-2 text-yellow-300 text-xs font-normal">
                        ⚠ {issueCount} with issues
                      </span>
                    )}
                    {allIssues && (
                      <span className="ml-2 text-yellow-700 text-xs font-semibold">⚠ All delayed/disrupted</span>
                    )}
                  </span>
                  <span className={allIssues ? 'text-gray-500' : 'text-blue-200'}>
                    {collapsed ? '▸' : '▾'}
                  </span>
                </button>

                {!collapsed && (
                  <TrainTable
                    trains={routeTrains}
                    subscriptions={subscriptions}
                    onSubscribe={handleSubscribeToggle}
                    showSubscribeColumn
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

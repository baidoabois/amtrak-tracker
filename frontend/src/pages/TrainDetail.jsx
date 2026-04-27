import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import api from '../api.js';

function StatusBadge({ train }) {
  if (train.serviceDisrupted)
    return <span className="px-3 py-1 rounded-full text-sm font-semibold bg-red-100 text-red-700">⚠ Disrupted</span>;
  if (train.delayMinutes >= 15)
    return <span className="px-3 py-1 rounded-full text-sm font-semibold bg-yellow-100 text-yellow-800">🕐 {train.delayMinutes} min late</span>;
  return <span className="px-3 py-1 rounded-full text-sm font-semibold bg-green-100 text-green-700">✓ On Time</span>;
}

function formatTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function StationStatusDot({ status }) {
  const colors = {
    departed: 'bg-green-500',
    arrived: 'bg-green-400',
    enroute: 'bg-blue-500',
    scheduled: 'bg-gray-300',
  };
  return <span className={`inline-block w-2.5 h-2.5 rounded-full ${colors[status] ?? 'bg-gray-300'}`} />;
}

export default function TrainDetail() {
  const { number } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [train, setTrain] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [subscriptions, setSubscriptions] = useState([]);
  const [subscribing, setSubscribing] = useState(false);

  const fetchTrain = async () => {
    try {
      const { data } = await api.get(`/trains/${number}`);
      setTrain(data.train);
      setLastUpdated(data.train.updatedAt ?? data.train.lastFetched ?? null);
    } catch (e) {
      setError(e.response?.data?.message || 'Train not found');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrain();
    const interval = setInterval(fetchTrain, 120000);
    return () => clearInterval(interval);
  }, [number]);

  useEffect(() => {
    if (user) {
      api.get('/subscriptions').then(({ data }) => setSubscriptions(data.subscriptions)).catch(() => {});
    }
  }, [user]);

  const existingSub = subscriptions.find((s) => s.trainNumber === String(number));
  const isSubscribed = !!existingSub;

  const handleToggleSubscription = async () => {
    if (!user) { navigate('/register'); return; }
    setSubscribing(true);
    try {
      if (isSubscribed) {
        const { data } = await api.delete(`/subscriptions/${existingSub._id}`);
        setSubscriptions(data.subscriptions);
      } else {
        const { data } = await api.post('/subscriptions', {
          trainNumber: String(number),
          trainName: train?.route || '',
        });
        setSubscriptions(data.subscriptions);
      }
    } catch (e) {
      alert(e.response?.data?.message || 'Action failed');
    } finally {
      setSubscribing(false);
    }
  };

  if (loading) return <div className="text-center py-24 text-gray-400">Loading train data...</div>;
  if (error) return (
    <div className="max-w-2xl mx-auto px-4 py-16 text-center">
      <p className="text-red-500 mb-4">{error}</p>
      <button onClick={() => navigate('/')} className="text-amtrak-blue hover:underline">← Back to Live Board</button>
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Back link */}
      <button onClick={() => navigate('/')} className="text-sm text-amtrak-blue hover:underline mb-6 flex items-center gap-1">
        ← Live Board
      </button>

      {/* Header */}
      <div className="bg-white rounded-xl shadow p-6 mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-amtrak-blue">Train {train.number}</h1>
            <p className="text-gray-500 mt-1">{train.route}</p>
            <div className="mt-2 flex flex-wrap gap-2 items-center">
              <StatusBadge train={train} />
              <span className="text-sm text-gray-400">State: {train.state}</span>
            </div>
            {train.statusMsg && (
              <p className="mt-2 text-sm text-gray-600 italic">{train.statusMsg}</p>
            )}
          </div>
          <div className="text-right space-y-1">
            <div className="text-sm text-gray-500">Speed: <strong>{Math.round(train.velocity)} mph</strong></div>
            <div className="text-sm text-gray-500">
              Updated: <strong>{lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : '—'}</strong>
            </div>
            {user ? (
              <button
                onClick={handleToggleSubscription}
                disabled={subscribing}
                className={`mt-2 px-4 py-2 rounded-lg text-sm transition-colors ${
                  isSubscribed
                    ? 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100'
                    : 'bg-amtrak-blue text-white hover:bg-blue-800'
                }`}
              >
                {subscribing ? '...' : isSubscribed ? '✓ Subscribed — click to remove' : '+ Get Alerts'}
              </button>
            ) : (
              <button
                onClick={() => navigate('/register')}
                className="mt-2 px-4 py-2 rounded-lg text-sm bg-amtrak-blue text-white hover:bg-blue-800 transition-colors"
              >
                Sign up for alerts
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Station timeline */}
      <div className="bg-white rounded-xl shadow p-6">
        <div className="flex items-center gap-4 mb-5">
          <h2 className="font-semibold text-gray-800">Today's Schedule</h2>
          <div className="flex gap-3 text-xs text-gray-500">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block"/>Departed</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block"/>En route</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-gray-300 inline-block"/>Upcoming</span>
          </div>
        </div>

        {train.stations.length === 0 ? (
          <p className="text-gray-400 text-sm">No station data available.</p>
        ) : (
          <div className="relative">
            {/* Vertical track line */}
            <div className="absolute left-[1.1rem] top-2 bottom-2 w-0.5 bg-gray-200" />

            <div className="space-y-0">
              {train.stations.map((s, i) => {
                const isDeparted = s.status === 'departed';
                const isArrived  = s.status === 'arrived';
                const isEnroute  = s.status === 'enroute';
                const isPast     = isDeparted || isArrived;
                const isUpcoming = s.status === 'scheduled';

                const schedArr = formatTime(s.scheduledArrival);
                const estArr   = formatTime(s.estimatedArrival);
                const schedDep = formatTime(s.scheduledDeparture);
                const estDep   = formatTime(s.estimatedDeparture);

                const arrDelay = s.scheduledArrival && s.estimatedArrival
                  ? Math.round((new Date(s.estimatedArrival) - new Date(s.scheduledArrival)) / 60000)
                  : 0;
                const depDelay = s.scheduledDeparture && s.estimatedDeparture
                  ? Math.round((new Date(s.estimatedDeparture) - new Date(s.scheduledDeparture)) / 60000)
                  : 0;

                // Was this stop late? Use whichever delay we have
                const wasLate = (depDelay > 5) || (arrDelay > 5);

                // ── Visual config per status ──────────────────────────────
                const dotColor = isPast && wasLate  ? 'bg-red-500'
                               : isPast             ? 'bg-green-500'
                               : isEnroute          ? 'bg-blue-500 ring-2 ring-blue-300'
                               :                      'bg-gray-300';

                const rowBg    = isEnroute          ? 'bg-blue-50 rounded-lg'
                               : isPast && wasLate  ? 'bg-red-50'
                               : isPast             ? 'bg-green-50'
                               :                      '';

                const nameColor = isEnroute         ? 'text-amtrak-blue'
                                : isPast && wasLate ? 'text-red-700'
                                : isPast            ? 'text-green-700'
                                :                     'text-gray-400';

                const nameFontWeight = isPast || isEnroute ? 'font-bold' : 'font-normal';

                return (
                  <div key={i} className={`relative flex gap-4 px-2 py-3 ${rowBg}`}>
                    {/* Timeline dot */}
                    <div className="flex-shrink-0 w-5 flex justify-center pt-1.5 z-10">
                      <span className={`w-3 h-3 rounded-full inline-block ${dotColor}`} />
                    </div>

                    {/* Station content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className={`text-sm ${nameFontWeight} ${nameColor} ${isEnroute ? 'text-base' : ''}`}>
                          {s.station?.name || s.code}
                          {s.bus && <span className="ml-1 text-xs text-orange-500 font-normal">(Bus)</span>}
                        </span>

                        {/* Status pill */}
                        {isEnroute && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-700 animate-pulse">
                            ● En Route — Next Stop
                          </span>
                        )}
                        {isDeparted && wasLate && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700">
                            ✓ Departed Late
                          </span>
                        )}
                        {isDeparted && !wasLate && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                            ✓ Departed
                          </span>
                        )}
                        {isArrived && wasLate && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700">
                            ✓ Arrived Late
                          </span>
                        )}
                        {isArrived && !wasLate && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                            ✓ Arrived
                          </span>
                        )}
                        {isUpcoming && (
                          <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-400">
                            Scheduled
                          </span>
                        )}
                      </div>

                      {/* Time details */}
                      <div className="mt-1 flex flex-wrap gap-x-5 gap-y-0.5 text-xs">
                        {s.scheduledArrival && (
                          <span className={isUpcoming ? 'text-gray-400' : 'text-gray-600'}>
                            Arr: <strong>{schedArr}</strong>
                            {estArr !== schedArr && estArr !== '—' && (
                              <span className={arrDelay > 5 ? 'text-red-600 font-bold ml-1' : arrDelay < 0 ? 'text-green-600 ml-1' : 'text-gray-400 ml-1'}>
                                → {estArr} {arrDelay !== 0 ? `(${arrDelay > 0 ? '+' : ''}${arrDelay}m)` : ''}
                              </span>
                            )}
                          </span>
                        )}
                        {s.scheduledDeparture && (
                          <span className={isUpcoming ? 'text-gray-400' : 'text-gray-600'}>
                            Dep: <strong>{schedDep}</strong>
                            {estDep !== schedDep && estDep !== '—' && (
                              <span className={depDelay > 5 ? 'text-red-600 font-bold ml-1' : depDelay < 0 ? 'text-green-600 ml-1' : 'text-gray-400 ml-1'}>
                                → {estDep} {depDelay !== 0 ? `(${depDelay > 0 ? '+' : ''}${depDelay}m)` : ''}
                              </span>
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

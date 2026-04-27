import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useTrains } from '../hooks/useTrains.js';
import api from '../api.js';

export default function Dashboard() {
  const { user } = useAuth();
  const { trains } = useTrains(120000);
  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addForm, setAddForm] = useState({ trainNumber: '', notifyDelay: true, notifyCancel: true });
  const [addError, setAddError] = useState('');

  useEffect(() => {
    api.get('/subscriptions')
      .then(({ data }) => setSubscriptions(data.subscriptions))
      .finally(() => setLoading(false));
  }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    setAddError('');
    try {
      const matchedTrain = trains.find((t) => String(t.number) === addForm.trainNumber);
      const { data } = await api.post('/subscriptions', {
        trainNumber: addForm.trainNumber,
        trainName: matchedTrain?.route || '',
        notifyDelay: addForm.notifyDelay,
        notifyCancel: addForm.notifyCancel,
      });
      setSubscriptions(data.subscriptions);
      setAddForm({ trainNumber: '', notifyDelay: true, notifyCancel: true });
    } catch (err) {
      setAddError(err.response?.data?.message || 'Failed to add subscription');
    }
  };

  const handleDelete = async (id) => {
    const { data } = await api.delete(`/subscriptions/${id}`);
    setSubscriptions(data.subscriptions);
  };

  const handleToggle = async (sub, field) => {
    const { data } = await api.patch(`/subscriptions/${sub._id}`, {
      [field]: !sub[field],
    });
    setSubscriptions(data.subscriptions);
  };

  const getLiveStatus = (trainNumber) => {
    const t = trains.find((t) => String(t.number) === trainNumber);
    if (!t) return null;
    return t;
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-amtrak-blue mb-1">My Trains</h1>
      <p className="text-gray-500 text-sm mb-6">
        You'll receive email alerts at <strong>{user?.email}</strong> when subscribed trains are delayed or disrupted.
      </p>

      {/* Add subscription */}
      <div className="bg-white rounded-xl shadow p-5 mb-8">
        <h2 className="font-semibold text-gray-800 mb-3">Subscribe to a Train</h2>
        <form onSubmit={handleAdd} className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Train Number</label>
            <input
              type="text"
              placeholder="e.g. 774"
              value={addForm.trainNumber}
              onChange={(e) => setAddForm({ ...addForm, trainNumber: e.target.value })}
              required
              className="border rounded-lg px-3 py-2 text-sm w-32 focus:outline-none focus:ring-2 focus:ring-amtrak-blue"
            />
          </div>
          <label className="flex items-center gap-1 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={addForm.notifyDelay}
              onChange={(e) => setAddForm({ ...addForm, notifyDelay: e.target.checked })}
              className="accent-amtrak-blue"
            />
            Delay alerts
          </label>
          <label className="flex items-center gap-1 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={addForm.notifyCancel}
              onChange={(e) => setAddForm({ ...addForm, notifyCancel: e.target.checked })}
              className="accent-amtrak-blue"
            />
            Disruption alerts
          </label>
          <button
            type="submit"
            className="bg-amtrak-blue text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-800 transition-colors"
          >
            Add
          </button>
        </form>
        {addError && <p className="text-red-600 text-sm mt-2">{addError}</p>}
      </div>

      {/* Subscription list */}
      <h2 className="font-semibold text-gray-800 mb-3">Your Subscriptions</h2>
      {loading ? (
        <p className="text-gray-400">Loading...</p>
      ) : subscriptions.length === 0 ? (
        <p className="text-gray-400">No subscriptions yet. Add a train above.</p>
      ) : (
        <div className="space-y-3">
          {subscriptions.map((sub) => {
            const live = getLiveStatus(sub.trainNumber);
            const isDelayed = live?.delayMinutes >= 15;
            const isDisrupted = live?.serviceDisrupted;

            return (
              <div
                key={sub._id}
                className={`bg-white rounded-xl shadow p-4 border-l-4 ${
                  isDisrupted ? 'border-red-500' : isDelayed ? 'border-yellow-400' : 'border-green-400'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <a
                      href={`/trains/${sub.trainNumber}`}
                      className="font-semibold text-amtrak-blue text-lg hover:underline"
                    >
                      Train {sub.trainNumber}
                    </a>
                    {sub.trainName && (
                      <div className="text-sm text-gray-500">{sub.trainName}</div>
                    )}
                    {live && (
                      <div className="text-sm mt-1">
                        {isDisrupted ? (
                          <span className="text-red-600 font-medium">⚠ {live.statusMsg || 'Disrupted'}</span>
                        ) : isDelayed ? (
                          <span className="text-yellow-700 font-medium">
                            🕐 {live.delayMinutes} minutes late
                          </span>
                        ) : (
                          <span className="text-green-600">✓ On time</span>
                        )}
                      </div>
                    )}
                    {!live && (
                      <div className="text-xs text-gray-400 mt-1">Not currently active</div>
                    )}
                  </div>
                  <button
                    onClick={() => handleDelete(sub._id)}
                    className="text-gray-400 hover:text-red-500 transition-colors text-lg"
                    title="Remove"
                  >
                    ×
                  </button>
                </div>
                <div className="flex gap-4 mt-3 text-sm">
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sub.notifyDelay}
                      onChange={() => handleToggle(sub, 'notifyDelay')}
                      className="accent-amtrak-blue"
                    />
                    Delay alerts
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sub.notifyCancel}
                      onChange={() => handleToggle(sub, 'notifyCancel')}
                      className="accent-amtrak-blue"
                    />
                    Disruption alerts
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

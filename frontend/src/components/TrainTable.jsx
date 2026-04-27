import TrainRow from './TrainRow.jsx';

export default function TrainTable({ trains, subscriptions = [], onSubscribe, showSubscribeColumn }) {
  const subscribedNumbers = new Set(subscriptions.map((s) => s.trainNumber));

  return (
    <div className="overflow-x-auto rounded-lg shadow">
      <table className="min-w-full bg-white text-sm">
        <thead className="bg-amtrak-blue text-white">
          <tr>
            <th className="px-4 py-3 text-left">Train #</th>
            <th className="px-4 py-3 text-left">Route</th>
            <th className="px-4 py-3 text-left">Status</th>
            <th className="px-4 py-3 text-left">State</th>
            <th className="px-4 py-3 text-left">Message</th>
            <th className="px-4 py-3 text-left">Speed</th>
            {showSubscribeColumn && <th className="px-4 py-3 text-left">Alert</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {trains.length === 0 ? (
            <tr>
              <td colSpan={showSubscribeColumn ? 7 : 6} className="px-4 py-8 text-center text-gray-400">
                No trains found
              </td>
            </tr>
          ) : (
            trains.map((train) => (
              <TrainRow
                key={train.id}
                train={train}
                isSubscribed={subscribedNumbers.has(String(train.number))}
                onSubscribe={showSubscribeColumn ? onSubscribe : undefined}
              />
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

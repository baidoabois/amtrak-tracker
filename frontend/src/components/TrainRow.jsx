export default function TrainRow({ train, isSubscribed, onSubscribe }) {
  const isDelayed = train.delayMinutes >= 15;
  const isDisrupted = train.serviceDisrupted;

  const statusColor = isDisrupted
    ? 'bg-red-100 border-l-4 border-red-500'
    : isDelayed
    ? 'bg-yellow-50 border-l-4 border-yellow-400'
    : '';

  const badge = isDisrupted ? (
    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
      Disrupted
    </span>
  ) : isDelayed ? (
    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-800">
      {train.delayMinutes}m late
    </span>
  ) : (
    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
      On Time
    </span>
  );

  return (
    <tr className={`hover:bg-blue-50 transition-colors ${statusColor}`}>
      <td className="px-4 py-3 font-mono font-semibold">
        <a
          href={`/trains/${train.number}`}
          className="text-amtrak-blue hover:underline hover:text-blue-800 transition-colors"
        >
          {train.number}
        </a>
      </td>
      <td className="px-4 py-3">{train.route || '—'}</td>
      <td className="px-4 py-3">{badge}</td>
      <td className="px-4 py-3 text-sm text-gray-600">{train.state}</td>
      <td className="px-4 py-3 text-sm text-gray-500 max-w-xs truncate">
        {train.statusMsg || '—'}
      </td>
      <td className="px-4 py-3 text-sm">
        {Math.round(train.velocity)} mph
      </td>
      {onSubscribe && (
        <td className="px-4 py-3">
          <button
            onClick={() => onSubscribe(train)}
            className={`text-xs px-3 py-1 rounded transition-colors ${
              isSubscribed
                ? 'bg-red-50 text-red-500 border border-red-200 hover:bg-red-100'
                : 'bg-amtrak-blue text-white hover:bg-blue-800'
            }`}
          >
            {isSubscribed ? '✓ Unsubscribe' : 'Subscribe'}
          </button>
        </td>
      )}
    </tr>
  );
}

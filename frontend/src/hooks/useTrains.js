import { useState, useEffect, useRef } from 'react';
import api from '../api.js';

export function useTrains(intervalMs = 120000) {
  const [trains, setTrains] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const intervalRef = useRef(null);

  const fetch = async () => {
    try {
      const { data } = await api.get('/trains');
      setTrains(data.trains);
      setLastUpdated(data.lastUpdated);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load train data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetch();
    intervalRef.current = setInterval(fetch, intervalMs);
    return () => clearInterval(intervalRef.current);
  }, []);

  return { trains, lastUpdated, loading, error, refetch: fetch };
}

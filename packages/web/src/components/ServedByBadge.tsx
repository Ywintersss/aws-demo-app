import { useEffect, useState, type JSX } from 'react';
import { getLastResponseMeta } from '../api/client.js';

/** Polled rather than event-driven — the simplest thing that keeps the footer honest after every fetch, without threading a global event bus through apiFetch. */
export const ServedByBadge = (): JSX.Element => {
  const [meta, setMeta] = useState(getLastResponseMeta());

  useEffect(() => {
    const interval = setInterval(() => setMeta(getLastResponseMeta()), 500);
    return () => clearInterval(interval);
  }, []);

  return (
    <footer style={{ padding: '0.5rem 1rem', fontSize: '0.8rem', borderTop: '1px solid #ddd' }}>
      Served by <strong>{meta.servedBy ?? '—'}</strong> in <strong>{meta.az ?? '—'}</strong>
    </footer>
  );
};

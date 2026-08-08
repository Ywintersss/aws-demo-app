import { useEffect, useRef, useState, type JSX } from 'react';
import { apiFetch } from '../api/client.js';

type Meta = {
  instanceId: string;
  availabilityZone: string;
  version: string;
  uptimeSeconds: number;
  adapters: { db: string; auth: string; identity: string };
};

const HISTORY_LIMIT = 50;
const POLL_INTERVAL_MS = 1500;

export const InfraPage = (): JSX.Element => {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [burning, setBurning] = useState(false);
  const historyRef = useRef<string[]>([]);

  useEffect(() => {
    const poll = async (): Promise<void> => {
      try {
        const result = await apiFetch<Meta>('/api/meta');
        setMeta(result);
        setError(null);
        historyRef.current = [...historyRef.current, result.instanceId].slice(-HISTORY_LIMIT);
        setHistory(historyRef.current);
      } catch {
        setError('Could not reach /api/meta');
      }
    };
    poll().catch(() => undefined);
    const interval = setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  const distribution = history.reduce<Record<string, number>>((acc, id) => {
    acc[id] = (acc[id] ?? 0) + 1;
    return acc;
  }, {});

  const handleFail = async (): Promise<void> => {
    await apiFetch('/api/admin/health/fail', { method: 'POST' });
  };
  const handleRecover = async (): Promise<void> => {
    await apiFetch('/api/admin/health/recover', { method: 'POST' });
  };
  const handleBurn = async (): Promise<void> => {
    setBurning(true);
    await apiFetch('/api/admin/load/burn', { method: 'POST' });
    setBurning(false);
  };

  return (
    <div style={{ maxWidth: 720, margin: '2rem auto' }}>
      <h1>Infra</h1>
      {error !== null && <p role="alert">{error}</p>}
      {meta !== null && (
        <>
          <p>
            Version {meta.version} · uptime {Math.round(meta.uptimeSeconds)}s
          </p>
          <p>
            Adapters: db={meta.adapters.db}, auth={meta.adapters.auth}, identity={meta.adapters.identity}
          </p>
        </>
      )}

      <h2>Instance distribution (last {history.length} of {HISTORY_LIMIT} requests)</h2>
      <ul>
        {Object.entries(distribution).map(([instanceId, count]) => (
          <li key={instanceId}>
            {instanceId}: {'█'.repeat(count)} ({count})
          </li>
        ))}
      </ul>

      <h2>Health toggle</h2>
      <button onClick={handleFail}>Force unhealthy</button>
      <button onClick={handleRecover}>Recover</button>

      <h2>Load</h2>
      <button onClick={handleBurn} disabled={burning}>
        {burning ? 'Burning…' : 'Burn CPU (2s)'}
      </button>
    </div>
  );
};

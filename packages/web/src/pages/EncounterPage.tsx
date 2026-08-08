import { useEffect, useState, type FormEvent, type JSX } from 'react';
import { useParams } from 'react-router-dom';
import { apiFetch } from '../api/client.js';

type Encounter = { id: string; patientId: string; type: string; department: string; status: string; admittedAt: string; dischargedAt: string | null };
type Observation = { id: string; code: string; valueNum: number | null; valueText: string | null; unit: string | null; recordedAt: string };

const OBSERVATION_CODES = ['heart_rate', 'blood_pressure', 'temperature', 'spo2', 'weight'] as const;

export const EncounterPage = (): JSX.Element => {
  const { id } = useParams<{ id: string }>();
  const [encounter, setEncounter] = useState<Encounter | null>(null);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [form, setForm] = useState<{ code: string; value: string; unit: string }>({
    code: 'heart_rate',
    value: '',
    unit: '',
  });

  const reload = async (): Promise<void> => {
    if (id === undefined) return;
    setEncounter(await apiFetch<Encounter>(`/api/encounters/${id}`));
    setObservations(await apiFetch<Observation[]>(`/api/encounters/${id}/observations`));
  };

  useEffect(() => {
    reload().catch(() => undefined);
  }, [id]);

  const handleAddObservation = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    const numeric = Number(form.value);
    const payload = Number.isNaN(numeric)
      ? { code: form.code, valueText: form.value }
      : { code: form.code, valueNum: numeric, unit: form.unit || undefined };
    await apiFetch(`/api/encounters/${id}/observations`, { method: 'POST', body: JSON.stringify(payload) });
    setForm({ code: 'heart_rate', value: '', unit: '' });
    await reload();
  };

  const handleDischarge = async (): Promise<void> => {
    await apiFetch(`/api/encounters/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'discharged' }) });
    await reload();
  };

  if (encounter === null) return <p>Loading…</p>;

  return (
    <div style={{ maxWidth: 720, margin: '2rem auto' }}>
      <h1>
        {encounter.type} — {encounter.department}
      </h1>
      <p>
        Status: <strong>{encounter.status}</strong>
        {encounter.status === 'open' && <button onClick={handleDischarge}>Discharge</button>}
      </p>

      <h2>Observations</h2>
      <table>
        <thead>
          <tr>
            <th>Code</th>
            <th>Value</th>
            <th>Unit</th>
            <th>Recorded</th>
          </tr>
        </thead>
        <tbody>
          {observations.map((observation) => (
            <tr key={observation.id}>
              <td>{observation.code}</td>
              <td>{observation.valueNum ?? observation.valueText}</td>
              <td>{observation.unit ?? '—'}</td>
              <td>{observation.recordedAt}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Record observation</h3>
      <form onSubmit={handleAddObservation}>
        <select value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })}>
          {OBSERVATION_CODES.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>
        <input placeholder="Value" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} required />
        <input placeholder="Unit (optional)" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
        <button type="submit">Record</button>
      </form>
    </div>
  );
};

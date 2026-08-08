import { useEffect, useState, type FormEvent, type JSX } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { apiFetch } from '../api/client.js';

type Patient = { id: string; mrn: string; name: string; dob: string; sex: string; phone: string };
type Encounter = { id: string; type: string; department: string; status: string; admittedAt: string };

export const PatientDetailPage = (): JSX.Element => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [encounters, setEncounters] = useState<Encounter[]>([]);
  const [newEncounter, setNewEncounter] = useState({ type: 'outpatient', department: '' });

  const reload = async (): Promise<void> => {
    if (id === undefined) return;
    setPatient(await apiFetch<Patient>(`/api/patients/${id}`));
    setEncounters(await apiFetch<Encounter[]>(`/api/patients/${id}/encounters`));
  };

  useEffect(() => {
    reload().catch(() => undefined);
  }, [id]);

  const handleCreateEncounter = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    await apiFetch(`/api/patients/${id}/encounters`, { method: 'POST', body: JSON.stringify(newEncounter) });
    setNewEncounter({ type: 'outpatient', department: '' });
    await reload();
  };

  const handleDelete = async (): Promise<void> => {
    await apiFetch(`/api/patients/${id}`, { method: 'DELETE' });
    navigate('/patients');
  };

  if (patient === null) return <p>Loading…</p>;

  return (
    <div style={{ maxWidth: 720, margin: '2rem auto' }}>
      <p>
        <Link to="/patients">&larr; back to patients</Link>
      </p>
      <h1>
        {patient.name} — {patient.mrn}
      </h1>
      <p>
        DOB {patient.dob} · {patient.sex} · {patient.phone}
      </p>
      <button onClick={handleDelete}>Delete patient</button>

      <h2>Encounters</h2>
      <ul>
        {encounters.map((encounter) => (
          <li key={encounter.id}>
            <Link to={`/encounters/${encounter.id}`}>
              {encounter.type} — {encounter.department} ({encounter.status})
            </Link>
          </li>
        ))}
      </ul>

      <h3>New encounter</h3>
      <form onSubmit={handleCreateEncounter}>
        <select value={newEncounter.type} onChange={(e) => setNewEncounter({ ...newEncounter, type: e.target.value })}>
          <option value="outpatient">Outpatient</option>
          <option value="inpatient">Inpatient</option>
          <option value="emergency">Emergency</option>
        </select>
        <input
          placeholder="Department"
          value={newEncounter.department}
          onChange={(e) => setNewEncounter({ ...newEncounter, department: e.target.value })}
          required
        />
        <button type="submit">Open encounter</button>
      </form>
    </div>
  );
};

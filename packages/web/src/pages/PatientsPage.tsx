import { useEffect, useState, type FormEvent, type JSX } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../api/client.js';

type Patient = { id: string; mrn: string; name: string; dob: string; phone: string };
type Page<T> = { items: T[]; page: number; pageSize: number; total: number };

export const PatientsPage = (): JSX.Element => {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState<Page<Patient> | null>(null);
  const [form, setForm] = useState({ name: '', dob: '', sex: 'unknown', phone: '' });

  const reload = async (): Promise<void> => {
    const query = new URLSearchParams({ search, page: '1', pageSize: '20' });
    setPage(await apiFetch<Page<Patient>>(`/api/patients?${query.toString()}`));
  };

  useEffect(() => {
    reload().catch(() => undefined);
  }, [search]);

  const handleCreate = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    await apiFetch('/api/patients', { method: 'POST', body: JSON.stringify(form) });
    setForm({ name: '', dob: '', sex: 'unknown', phone: '' });
    await reload();
  };

  return (
    <div style={{ maxWidth: 720, margin: '2rem auto' }}>
      <h1>Patients</h1>
      <input placeholder="Search by name or MRN" value={search} onChange={(e) => setSearch(e.target.value)} />
      <ul>
        {page?.items.map((patient) => (
          <li key={patient.id}>
            <Link to={`/patients/${patient.id}`}>
              {patient.name} — {patient.mrn}
            </Link>
          </li>
        ))}
      </ul>
      {page !== null && <p>{page.total} total</p>}

      <h2>New patient</h2>
      <form onSubmit={handleCreate}>
        <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <input type="date" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} required />
        <select value={form.sex} onChange={(e) => setForm({ ...form, sex: e.target.value })}>
          <option value="unknown">Unknown</option>
          <option value="male">Male</option>
          <option value="female">Female</option>
          <option value="other">Other</option>
        </select>
        <input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required />
        <button type="submit">Create</button>
      </form>
    </div>
  );
};

import { useEffect, useState, type FormEvent, type JSX } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.js';

type DemoUser = { email: string; role: string; branchCode: string; displayName: string };

export const LoginPage = (): JSX.Element => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [demoUsers, setDemoUsers] = useState<DemoUser[]>([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('demo1234');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<DemoUser[]>('/api/auth/demo-users').then(setDemoUsers).catch(() => undefined);
  }, []);

  const handleSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setError(null);
    try {
      await login(email, password);
      navigate('/patients');
    } catch {
      setError('Invalid email or password.');
    }
  };

  return (
    <div style={{ maxWidth: 360, margin: '4rem auto' }}>
      <h1>Aethelgard EHR — Demo Login</h1>
      <form onSubmit={handleSubmit}>
        <label>
          Demo account
          <select
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setPassword('demo1234');
            }}
          >
            <option value="">— choose a demo account —</option>
            {demoUsers.map((user) => (
              <option key={user.email} value={user.email}>
                {user.displayName} ({user.role}, {user.branchCode})
              </option>
            ))}
          </select>
        </label>
        <label>
          Email
          <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required />
        </label>
        <label>
          Password
          <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" required />
        </label>
        {error !== null && <p role="alert">{error}</p>}
        <button type="submit">Log in</button>
      </form>
    </div>
  );
};

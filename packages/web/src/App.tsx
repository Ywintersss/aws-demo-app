import type { JSX } from 'react';
import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext.js';
import { LoginPage } from './pages/LoginPage.js';
import { PatientsPage } from './pages/PatientsPage.js';
import { PatientDetailPage } from './pages/PatientDetailPage.js';
import { EncounterPage } from './pages/EncounterPage.js';
import { InfraPage } from './pages/InfraPage.js';
import { ServedByBadge } from './components/ServedByBadge.js';

const RequireAuth = ({ children }: { children: JSX.Element }): JSX.Element => {
  const { token } = useAuth();
  return token === null ? <Navigate to="/login" replace /> : children;
};

const NavBar = (): JSX.Element => {
  const { principal, logout } = useAuth();
  if (principal === null) return <></>;
  return (
    <nav style={{ padding: '0.5rem 1rem', borderBottom: '1px solid #ddd', display: 'flex', gap: '1rem' }}>
      <Link to="/patients">Patients</Link>
      <Link to="/infra">Infra</Link>
      <span style={{ marginLeft: 'auto' }}>
        {principal.email} ({principal.role})
      </span>
      <button onClick={logout}>Log out</button>
    </nav>
  );
};

export const App = (): JSX.Element => (
  <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
    <NavBar />
    <main style={{ flex: 1 }}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<Navigate to="/patients" replace />} />
        <Route path="/patients" element={<RequireAuth><PatientsPage /></RequireAuth>} />
        <Route path="/patients/:id" element={<RequireAuth><PatientDetailPage /></RequireAuth>} />
        <Route path="/encounters/:id" element={<RequireAuth><EncounterPage /></RequireAuth>} />
        <Route path="/infra" element={<RequireAuth><InfraPage /></RequireAuth>} />
      </Routes>
    </main>
    <ServedByBadge />
  </div>
);

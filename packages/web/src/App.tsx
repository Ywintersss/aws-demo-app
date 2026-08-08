import type { JSX } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext.js';
import { LoginPage } from './pages/LoginPage.js';
import { PatientsPage } from './pages/PatientsPage.js';
import { PatientDetailPage } from './pages/PatientDetailPage.js';
import { ServedByBadge } from './components/ServedByBadge.js';

const RequireAuth = ({ children }: { children: JSX.Element }): JSX.Element => {
  const { token } = useAuth();
  return token === null ? <Navigate to="/login" replace /> : children;
};

export const App = (): JSX.Element => (
  <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
    <main style={{ flex: 1 }}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<Navigate to="/patients" replace />} />
        <Route path="/patients" element={<RequireAuth><PatientsPage /></RequireAuth>} />
        <Route path="/patients/:id" element={<RequireAuth><PatientDetailPage /></RequireAuth>} />
        {/* /encounters/:id and /infra are added in Tasks 15–16 */}
      </Routes>
    </main>
    <ServedByBadge />
  </div>
);

import type { JSX } from "react";
import { Link, NavLink, Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext.js";
import { LoginPage } from "./pages/LoginPage.js";
import { PatientsPage } from "./pages/PatientsPage.js";
import { PatientDetailPage } from "./pages/PatientDetailPage.js";
import { EncounterPage } from "./pages/EncounterPage.js";
import { InfraPage } from "./pages/InfraPage.js";
import { ServedByBadge } from "./components/ServedByBadge.js";

const RequireAuth = ({ children }: { children: JSX.Element }): JSX.Element => {
	const { token } = useAuth();
	return token === null ? <Navigate to="/login" replace /> : children;
};

const NavBar = (): JSX.Element => {
	const { principal, logout } = useAuth();
	if (principal === null) return <></>;
	return (
		<header className="rail">
			<div className="rail-inner">
				<Link to="/patients" className="brand">
					<span className="brand-name">Aethelgard</span>
					<span className="brand-sub">Electronic Health Records</span>
				</Link>
				<nav className="rail-nav" aria-label="Primary">
					<NavLink
						to="/patients"
						className={({ isActive }) =>
							`rail-link${isActive ? " active" : ""}`
						}
					>
						Patients
					</NavLink>
					<NavLink
						to="/infra"
						className={({ isActive }) =>
							`rail-link${isActive ? " active" : ""}`
						}
					>
						Infra
					</NavLink>
				</nav>
				<span className="rail-spacer" />
				<div className="rail-user">
					<span>{principal.email}</span>
					<span className="user-role">{principal.role}</span>
					<button type="button" className="btn btn-line" onClick={logout}>
						Log out
					</button>
				</div>
			</div>
		</header>
	);
};

export const App = (): JSX.Element => (
	<div className="app">
		<NavBar />
		<main className="app-main">
			<div className="board-wrap">
				<Routes>
					<Route path="/login" element={<LoginPage />} />
					<Route path="/" element={<Navigate to="/patients" replace />} />
					<Route
						path="/patients"
						element={
							<RequireAuth>
								<PatientsPage />
							</RequireAuth>
						}
					/>
					<Route
						path="/patients/:id"
						element={
							<RequireAuth>
								<PatientDetailPage />
							</RequireAuth>
						}
					/>
					<Route
						path="/encounters/:id"
						element={
							<RequireAuth>
								<EncounterPage />
							</RequireAuth>
						}
					/>
					<Route
						path="/infra"
						element={
							<RequireAuth>
								<InfraPage />
							</RequireAuth>
						}
					/>
				</Routes>
			</div>
		</main>
		<ServedByBadge />
	</div>
);

import { useEffect, useState, type FormEvent, type JSX } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api/client.js";
import { useAuth } from "../auth/AuthContext.js";

type DemoUser = {
	email: string;
	role: string;
	branchCode: string;
	displayName: string;
};

const STICKY_BGES = ["bg-a", "bg-b", "bg-c"] as const;

export const LoginPage = (): JSX.Element => {
	const { login } = useAuth();
	const navigate = useNavigate();
	const [demoUsers, setDemoUsers] = useState<DemoUser[]>([]);
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("demo1234");
	const [error, setError] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);

	useEffect(() => {
		apiFetch<DemoUser[]>("/api/auth/demo-users")
			.then(setDemoUsers)
			.catch(() => undefined);
	}, []);

	const handleSubmit = async (event: FormEvent): Promise<void> => {
		event.preventDefault();
		setError(null);
		setSubmitting(true);
		try {
			await login(email, password);
			navigate("/patients");
		} catch {
			setError("Invalid email or password.");
			setSubmitting(false);
		}
	};

	return (
		<div className="login-board board">
			<div className="board-head">
				<h1 className="login-title">Sign into the ward</h1>
			</div>
			<div className="board-body">
				<p className="login-lede">
					Aethelgard runs 5 demo accounts across 3 branches. Pick a sticky note
					to take the shift as that account — every demo user shares the
					password <code className="login-key">demo1234</code>.
				</p>

				<div className="sticky-grid" role="group" aria-label="Demo accounts">
					{demoUsers.map((user, index) => (
						<button
							type="button"
							key={user.email}
							className={`sticky ${STICKY_BGES[index % STICKY_BGES.length]}${email === user.email ? " selected" : ""}`}
							onClick={() => {
								setEmail(user.email);
								setPassword("demo1234");
							}}
						>
							<span className="sticky-name">{user.displayName}</span>
							<span className="sticky-meta">
								{user.role} · {user.branchCode}
							</span>
						</button>
					))}
				</div>

				<form onSubmit={handleSubmit}>
					<div className="login-fields">
						<label className="field">
							Email
							<input
								className="input"
								value={email}
								onChange={(event) => setEmail(event.target.value)}
								type="email"
								required
							/>
						</label>
						<label className="field">
							Password
							<input
								className="input"
								value={password}
								onChange={(event) => setPassword(event.target.value)}
								type="password"
								required
							/>
						</label>
					</div>
					{error !== null && (
						<p className="alert alert-danger" role="alert">
							{error}
						</p>
					)}
					<div className="login-actions">
						<button
							type="submit"
							className="btn btn-primary"
							disabled={submitting}
						>
							{submitting ? "Signing in…" : "Sign in"}
						</button>
						<span className="board-hint login-hint">
							The stored session survives refresh — signing out clears it.
						</span>
					</div>
				</form>
			</div>
		</div>
	);
};

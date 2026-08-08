import {
	createContext,
	useContext,
	useEffect,
	useState,
	type JSX,
	type ReactNode,
} from "react";
import {
	apiFetch,
	AUTH_UNAUTHORIZED_EVENT,
	getStoredToken,
	setStoredToken,
} from "../api/client.js";

export type Principal = {
	userId: string;
	email: string;
	role: string;
	branchId: string;
};
type LoginResult = { principal: Principal; token: string };

type AuthContextValue = {
	principal: Principal | null;
	token: string | null;
	login: (email: string, password: string) => Promise<void>;
	logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider = ({
	children,
}: {
	children: ReactNode;
}): JSX.Element => {
	const [token, setToken] = useState<string | null>(getStoredToken());
	const [principal, setPrincipal] = useState<Principal | null>(null);

	// Restore the session after a page refresh: the token survives in
	// localStorage but the principal does not, and the nav bar (and any
	// principal-dependent UI) renders nothing while it's null. Fetch it once
	// from /api/auth/me. If the token is stale/expired, drop it so RequireAuth
	// bounces to /login instead of leaving every page silently failing.
	useEffect(() => {
		if (token === null || principal !== null) return;
		let cancelled = false;
		apiFetch<Principal>("/api/auth/me")
			.then((me) => {
				if (!cancelled) setPrincipal(me);
			})
			.catch(() => {
				if (!cancelled) {
					setStoredToken(null);
					setToken(null);
				}
			});
		return () => {
			cancelled = true;
		};
	}, [token, principal]);

	// Any 401 seen by apiFetch anywhere in the app means the current token is
	// invalid (or was revoked, e.g. the JWT_SECRET changed server-side). Drop it
	// so the user is sent back to /login rather than stuck on a broken page.
	useEffect(() => {
		const onUnauthorized = (): void => {
			setToken(null);
			setPrincipal(null);
		};
		window.addEventListener(AUTH_UNAUTHORIZED_EVENT, onUnauthorized);
		return () =>
			window.removeEventListener(AUTH_UNAUTHORIZED_EVENT, onUnauthorized);
	}, []);

	const login = async (email: string, password: string): Promise<void> => {
		const result = await apiFetch<LoginResult>("/api/auth/login", {
			method: "POST",
			body: JSON.stringify({ email, password }),
		});
		setStoredToken(result.token);
		setToken(result.token);
		setPrincipal(result.principal);
	};

	const logout = (): void => {
		setStoredToken(null);
		setToken(null);
		setPrincipal(null);
	};

	return (
		<AuthContext.Provider value={{ principal, token, login, logout }}>
			{children}
		</AuthContext.Provider>
	);
};

export const useAuth = (): AuthContextValue => {
	const context = useContext(AuthContext);
	if (context === null) {
		throw new Error("useAuth must be used within an AuthProvider");
	}
	return context;
};

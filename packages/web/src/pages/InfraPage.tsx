import { useEffect, useRef, useState, type JSX } from "react";
import { apiFetch } from "../api/client.js";

type Meta = {
	instanceId: string;
	availabilityZone: string;
	version: string;
	uptimeSeconds: number;
	adapters: { db: string; auth: string; identity: string };
};

const HISTORY_LIMIT = 50;
const POLL_INTERVAL_MS = 1500;

const formatUptime = (seconds: number): string => {
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = Math.floor(seconds % 60);
	const pad = (n: number): string => String(n).padStart(2, "0");
	return h > 0 ? `${h}h ${pad(m)}m` : `${pad(m)}m ${pad(s)}s`;
};

export const InfraPage = (): JSX.Element => {
	const [meta, setMeta] = useState<Meta | null>(null);
	const [history, setHistory] = useState<string[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [actionError, setActionError] = useState<string | null>(null);
	const [burning, setBurning] = useState(false);
	const historyRef = useRef<string[]>([]);

	useEffect(() => {
		const poll = async (): Promise<void> => {
			try {
				const result = await apiFetch<Meta>("/api/meta");
				setMeta(result);
				setError(null);
				historyRef.current = [...historyRef.current, result.instanceId].slice(
					-HISTORY_LIMIT,
				);
				setHistory(historyRef.current);
			} catch {
				setError("Could not reach /api/meta");
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
		setActionError(null);
		try {
			await apiFetch("/api/admin/health/fail", { method: "POST" });
		} catch (error) {
			setActionError(
				error instanceof Error ? error.message : "Health check failed.",
			);
		}
	};
	const handleRecover = async (): Promise<void> => {
		setActionError(null);
		try {
			await apiFetch("/api/admin/health/recover", { method: "POST" });
		} catch (error) {
			setActionError(
				error instanceof Error ? error.message : "Recovery failed.",
			);
		}
	};
	const handleBurn = async (): Promise<void> => {
		setBurning(true);
		setActionError(null);
		try {
			await apiFetch("/api/admin/load/burn", { method: "POST" });
		} catch (error) {
			setActionError(
				error instanceof Error ? error.message : "Load burn failed.",
			);
		} finally {
			setBurning(false);
		}
	};

	const entries = Object.entries(distribution).sort((a, b) => b[1] - a[1]);
	const maxCount =
		entries.length > 0 ? Math.max(...entries.map(([, count]) => count)) : 1;

	return (
		<section className="board">
			<div className="board-head">
				<h1 className="board-title">
					The machines<small>live · 1.5s</small>
				</h1>
			</div>
			<div className="board-body">
				{error !== null && (
					<p className="alert alert-danger" role="alert">
						{error}
					</p>
				)}

				{actionError !== null && (
					<p className="alert alert-danger" role="alert">
						{actionError}
					</p>
				)}

				{meta !== null && (
					<>
						<div className="meta-line">
							<span className="live-pulse" aria-hidden="true" />
							Version <code>{meta.version}</code> · uptime{" "}
							<code>{formatUptime(meta.uptimeSeconds)}</code>
							{" · "}db <code>{meta.adapters.db}</code> · auth{" "}
							<code>{meta.adapters.auth}</code> · identity{" "}
							<code>{meta.adapters.identity}</code>
						</div>

						<div className="rule-bar" />

						<h2 className="board-subtitle">
							Instance distribution
							<span className="board-subtitle-note">
								last {history.length} of {HISTORY_LIMIT} requests
							</span>
						</h2>
						{entries.length === 0 ? (
							<div className="empty">
								<p className="empty-line">No traffic tallied yet</p>
								<p className="empty-sub">
									Requests land here as they're served.
								</p>
							</div>
						) : (
							<div className="tally">
								{entries.map(([instanceId, count]) => (
									<div className="tally-line" key={instanceId}>
										<span className="tally-id">{instanceId}</span>
										<span className="tally-track">
											<span
												className="tally-fill"
												style={{
													width: `${Math.max(4, (count / maxCount) * 100)}%`,
												}}
											/>
										</span>
										<span className="tally-count">{count}</span>
									</div>
								))}
							</div>
						)}

						<div className="rule-bar" />

						<h2 className="board-subtitle">Health</h2>
						<div className="form-row">
							<button
								type="button"
								className="btn btn-danger"
								onClick={handleFail}
							>
								Force unhealthy
							</button>
							<button type="button" className="btn" onClick={handleRecover}>
								Recover
							</button>
						</div>

						<div className="rule-bar" />

						<h2 className="board-subtitle">Load</h2>
						<div className="form-row">
							<button
								type="button"
								className="btn btn-primary"
								onClick={handleBurn}
								disabled={burning}
							>
								{burning ? "Burning…" : "Burn CPU (2s)"}
							</button>
						</div>
					</>
				)}
			</div>
		</section>
	);
};

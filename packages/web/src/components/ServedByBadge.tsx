import { useEffect, useState, type JSX } from "react";
import { getLastResponseMeta } from "../api/client.js";

/** Polled rather than event-driven — the simplest thing that keeps the footer honest after every fetch, without threading a global event bus through apiFetch. */
export const ServedByBadge = (): JSX.Element => {
	const [meta, setMeta] = useState(getLastResponseMeta());

	useEffect(() => {
		const interval = setInterval(() => setMeta(getLastResponseMeta()), 500);
		return () => clearInterval(interval);
	}, []);

	return (
		<footer className="stamp-footer">
			<div className="stamp-inner">
				<span>
					Served by <strong>{meta.servedBy ?? "—"}</strong>
				</span>
				<span className="stamp-sep">·</span>
				<span>
					in <strong>{meta.az ?? "—"}</strong>
				</span>
			</div>
		</footer>
	);
};

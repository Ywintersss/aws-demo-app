import { useEffect, useState, type FormEvent, type JSX } from "react";
import { Link, useParams } from "react-router-dom";
import { apiFetch } from "../api/client.js";
import { ChevronBack } from "../components/Chevron.js";
import { ErrorPanel } from "../components/ErrorPanel.js";

type Encounter = {
	id: string;
	patientId: string;
	type: string;
	department: string;
	status: string;
	admittedAt: string;
	dischargedAt: string | null;
};

type Observation = {
	id: string;
	code: string;
	valueNum: number | null;
	valueText: string | null;
	unit: string | null;
	recordedAt: string;
};

const OBSERVATION_CODES = [
	"heart_rate",
	"blood_pressure",
	"temperature",
	"spo2",
	"weight",
] as const;
const STATUS_DOT: Record<string, string> = {
	open: "open",
	discharged: "discharged",
	cancelled: "cancelled",
};

const formatDate = (iso: string): string => {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return iso;
	return d.toLocaleString("en-GB", {
		day: "2-digit",
		month: "short",
		hour: "2-digit",
		minute: "2-digit",
	});
};

export const EncounterPage = (): JSX.Element => {
	const { id } = useParams<{ id: string }>();
	const [encounter, setEncounter] = useState<Encounter | null>(null);
	const [observations, setObservations] = useState<Observation[]>([]);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [formError, setFormError] = useState<string | null>(null);
	const [discharging, setDischarging] = useState(false);
	const [form, setForm] = useState<{
		code: string;
		value: string;
		unit: string;
	}>({
		code: "heart_rate",
		value: "",
		unit: "",
	});

	const reload = async (): Promise<void> => {
		if (id === undefined) return;
		setLoadError(null);
		try {
			setEncounter(await apiFetch<Encounter>(`/api/encounters/${id}`));
			setObservations(
				await apiFetch<Observation[]>(`/api/encounters/${id}/observations`),
			);
		} catch (error) {
			setEncounter(null);
			setLoadError(
				error instanceof Error
					? error.message
					: "Could not load this encounter.",
			);
		}
	};

	useEffect(() => {
		reload().catch(() => undefined);
	}, [id]);

	const handleAddObservation = async (event: FormEvent): Promise<void> => {
		event.preventDefault();
		setFormError(null);
		try {
			const numeric = Number(form.value);
			const payload = Number.isNaN(numeric)
				? { code: form.code, valueText: form.value }
				: { code: form.code, valueNum: numeric, unit: form.unit || undefined };
			await apiFetch(`/api/encounters/${id}/observations`, {
				method: "POST",
				body: JSON.stringify(payload),
			});
			setForm({ code: "heart_rate", value: "", unit: "" });
			await reload();
		} catch (error) {
			setFormError(
				error instanceof Error ? error.message : "Could not record the value.",
			);
		}
	};

	const handleDischarge = async (): Promise<void> => {
		if (
			!window.confirm(
				"Discharge this encounter? The observation sheet stays on the record, but the encounter closes.",
			)
		) {
			return;
		}
		setDischarging(true);
		setFormError(null);
		try {
			await apiFetch(`/api/encounters/${id}`, {
				method: "PATCH",
				body: JSON.stringify({ status: "discharged" }),
			});
			await reload();
		} catch (error) {
			setFormError(
				error instanceof Error ? error.message : "Could not discharge.",
			);
		} finally {
			setDischarging(false);
		}
	};

	if (encounter === null) {
		return (
			<section className="board">
				<div className="board-body">
					{loadError === null ? (
						<div className="skeleton" aria-label="Loading" />
					) : (
						<ErrorPanel message={loadError} onRetry={reload} />
					)}
				</div>
			</section>
		);
	}

	const dot = STATUS_DOT[encounter.status] ?? "pending";

	return (
		<section className="board">
			<div className="board-body">
				<Link to={`/patients/${encounter.patientId}`} className="back-link">
					<ChevronBack /> back to patient
				</Link>

				<h1 className="board-title">
					{encounter.type} — {encounter.department}
					<small>{formatDate(encounter.admittedAt)}</small>
				</h1>

				<div className="meta-line status-line">
					<span className="live-pulse" aria-hidden="true" />
					<span className={`dot ${dot}`} aria-hidden="true" />{" "}
					<span className="label">{encounter.status}</span>
					{encounter.status === "open" && (
						<button
							type="button"
							className="btn btn-danger discharge-btn"
							onClick={handleDischarge}
							disabled={discharging}
						>
							{discharging ? "Discharging…" : "Discharge"}
						</button>
					)}
				</div>

				<div className="rule-bar" />

				<h2 className="board-subtitle">Observations</h2>
				{observations.length === 0 ? (
					<div className="empty">
						<p className="empty-line">Nothing written yet</p>
						<p className="empty-sub">
							Record the first observation to begin the sheet.
						</p>
					</div>
				) : (
					<table className="table">
						<thead>
							<tr>
								<th scope="col">Code</th>
								<th scope="col">Value</th>
								<th scope="col">Unit</th>
								<th scope="col">Recorded</th>
							</tr>
						</thead>
						<tbody>
							{observations.map((observation) => (
								<tr key={observation.id}>
									<td className="td-code">{observation.code}</td>
									<td className="td-value">
										{observation.valueNum ?? observation.valueText}
									</td>
									<td>{observation.unit ?? "—"}</td>
									<td className="td-code">
										{formatDate(observation.recordedAt)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				)}

				<h3 className="board-subtitle">Record observation</h3>
				{formError !== null && (
					<p className="alert alert-danger" role="alert">
						{formError}
					</p>
				)}
				<form onSubmit={handleAddObservation} className="form-row">
					<label className="field">
						Code
						<select
							className="select"
							value={form.code}
							onChange={(e) => setForm({ ...form, code: e.target.value })}
						>
							{OBSERVATION_CODES.map((code) => (
								<option key={code} value={code}>
									{code}
								</option>
							))}
						</select>
					</label>
					<label className="field">
						Value
						<input
							className="input"
							placeholder="Value"
							value={form.value}
							onChange={(e) => setForm({ ...form, value: e.target.value })}
							required
						/>
					</label>
					<label className="field">
						Unit (optional)
						<input
							className="input"
							placeholder="Unit (optional)"
							value={form.unit}
							onChange={(e) => setForm({ ...form, unit: e.target.value })}
						/>
					</label>
					<button type="submit" className="btn btn-primary">
						Record
					</button>
				</form>
			</div>
		</section>
	);
};

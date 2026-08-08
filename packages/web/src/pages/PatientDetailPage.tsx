import { useEffect, useState, type FormEvent, type JSX } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiFetch, ApiError } from "../api/client.js";
import { Chevron, ChevronBack } from "../components/Chevron.js";
import { ErrorPanel } from "../components/ErrorPanel.js";

type Patient = {
	id: string;
	mrn: string;
	name: string;
	dob: string;
	sex: string;
	phone: string;
};

type Encounter = {
	id: string;
	type: string;
	department: string;
	status: string;
	admittedAt: string;
};

const ENCOUNTER_TYPES = ["outpatient", "inpatient", "emergency"] as const;
const STATUS_DOT: Record<string, string> = {
	open: "open",
	discharged: "discharged",
	cancelled: "cancelled",
};

const branchClass = (mrn: string): string => {
	const code = mrn.split("-")[0].toLowerCase();
	return code === "kl" || code === "pg" || code === "jb" ? code : "";
};

const formatDate = (iso: string): string => {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return iso;
	return d.toLocaleString("en-GB", {
		day: "2-digit",
		month: "short",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
};

const formatDOB = (iso: string): string => {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return iso;
	return d.toLocaleDateString("en-GB", {
		day: "2-digit",
		month: "short",
		year: "numeric",
	});
};

	export const PatientDetailPage = (): JSX.Element => {
	const { id } = useParams<{ id: string }>();
	const navigate = useNavigate();
	const [patient, setPatient] = useState<Patient | null>(null);
	const [encounters, setEncounters] = useState<Encounter[]>([]);
	const [newEncounter, setNewEncounter] = useState({
		type: "outpatient" as string,
		department: "",
	});
	const [deleting, setDeleting] = useState(false);
	const [deleteError, setDeleteError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [formError, setFormError] = useState<string | null>(null);

	const reload = async (): Promise<void> => {
		if (id === undefined) return;
		setLoadError(null);
		try {
			setPatient(await apiFetch<Patient>(`/api/patients/${id}`));
			setEncounters(
				await apiFetch<Encounter[]>(`/api/patients/${id}/encounters`),
			);
		} catch (error) {
			if (error instanceof ApiError && error.status === 404) {
				setPatient(null);
				setLoadError("Patient not found — the record may have been deleted.");
			} else {
				setPatient(null);
				setLoadError("Could not load this patient. Check the network and try again.");
			}
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		setLoading(true);
		reload().catch(() => undefined);
	}, [id]);

	const handleCreateEncounter = async (event: FormEvent): Promise<void> => {
		event.preventDefault();
		setFormError(null);
		try {
			await apiFetch(`/api/patients/${id}/encounters`, {
				method: "POST",
				body: JSON.stringify(newEncounter),
			});
			setNewEncounter({ type: "outpatient", department: "" });
			await reload();
		} catch (error) {
			setFormError(
				error instanceof Error ? error.message : "Could not open the encounter.",
			);
		}
	};

	const handleDelete = async (): Promise<void> => {
		if (patient === null) return;
		if (
			!window.confirm(
				`Delete patient ${patient.name} (MRN ${patient.mrn})? This cannot be undone.`,
			)
		) {
			return;
		}
		setDeleting(true);
		setDeleteError(null);
		try {
			await apiFetch(`/api/patients/${id}`, { method: "DELETE" });
			navigate("/patients");
		} catch (error) {
			setDeleteError(error instanceof Error ? error.message : "Delete failed");
			setDeleting(false);
		}
	};

	if (loading && patient === null) {
		return <div className="skeleton" aria-label="Loading" />;
	}

	if (patient === null) {
		return (
			<section className="board">
				<div className="board-body">
					<Link to="/patients" className="back-link">
						<ChevronBack /> back to registry
					</Link>
					<ErrorPanel
						message={loadError ?? "Patient not found."}
						onRetry={reload}
					/>
				</div>
			</section>
		);
	}

	return (
		<section className="board">
			<div className="board-body">
				<Link to="/patients" className="back-link">
					<ChevronBack /> back to registry
				</Link>

				<h1 className="board-title">
					{patient.name}
					<small>
						<span className="mrn">{patient.mrn}</span>
					</small>
				</h1>
				{branchClass(patient.mrn) !== "" && (
					<span className={`branch-tag ${branchClass(patient.mrn)}`}>
						{patient.mrn.split("-")[0] ?? ""}
					</span>
				)}
				<p className="meta-line">
					DOB {formatDOB(patient.dob)} · {patient.sex} · {patient.phone}
				</p>

				{deleteError !== null && (
					<p className="alert alert-danger" role="alert">
						{deleteError}
					</p>
				)}
				<button
					type="button"
					className="btn btn-danger"
					onClick={handleDelete}
					disabled={deleting}
				>
					{deleting ? "Deleting…" : "Delete patient"}
				</button>

				<div className="rule-bar" />

				<h2 className="board-subtitle">Encounters</h2>
				{encounters.length === 0 ? (
					<div className="empty">
						<p className="empty-line">No encounters yet</p>
						<p className="empty-sub">
							Open one below — the first encounter starts the record.
						</p>
					</div>
				) : (
					<ul className="ledger">
						{encounters.map((encounter) => (
							<li key={encounter.id}>
								<Link to={`/encounters/${encounter.id}`} className="ledger-row">
									<span
										className={`dot ${STATUS_DOT[encounter.status] ?? "pending"}`}
										aria-hidden="true"
									/>
									<span className="ledger-main">
										<span className="ledger-name">
											{encounter.type} — {encounter.department}
										</span>
										<span className="ledger-meta">
											<span className="status">
												<span className="label">{encounter.status}</span>
											</span>
											<span className="lived-meta">
												{formatDate(encounter.admittedAt)}
											</span>
										</span>
									</span>
									<Chevron className="ledger-arrow" />
								</Link>
							</li>
						))}
					</ul>
				)}

				{formError !== null && (
					<p className="alert alert-danger" role="alert">
						{formError}
					</p>
				)}

				<h3 className="board-subtitle">Open encounter</h3>
				<form onSubmit={handleCreateEncounter} className="form-row">
					<label className="field">
						Type
						<select
							className="select"
							value={newEncounter.type}
							onChange={(e) =>
								setNewEncounter({ ...newEncounter, type: e.target.value })
							}
						>
							{ENCOUNTER_TYPES.map((type) => (
								<option key={type} value={type}>
									{type}
								</option>
							))}
						</select>
					</label>
					<label className="field">
						Department
						<input
							className="input"
							placeholder="Department"
							value={newEncounter.department}
							onChange={(e) =>
								setNewEncounter({ ...newEncounter, department: e.target.value })
							}
							required
						/>
					</label>
					<button type="submit" className="btn btn-primary">
						Open encounter
					</button>
				</form>
			</div>
		</section>
	);
};

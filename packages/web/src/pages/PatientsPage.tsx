import { useEffect, useState, type FormEvent, type JSX } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api/client.js";
import { Chevron } from "../components/Chevron.js";

type Patient = {
	id: string;
	mrn: string;
	name: string;
	dob: string;
	phone: string;
};
type Page<T> = { items: T[]; page: number; pageSize: number; total: number };

const branchClass = (mrn: string): string => {
	const code = mrn.split("-")[0].toLowerCase();
	return code === "kl" || code === "pg" || code === "jb" ? code : "";
};

export const PatientsPage = (): JSX.Element => {
const [search, setSearch] = useState("");
const [page, setPage] = useState<Page<Patient> | null>(null);
const [loadError, setLoadError] = useState<string | null>(null);
const [formError, setFormError] = useState<string | null>(null);
const [creating, setCreating] = useState(false);
const [form, setForm] = useState({
name: "",
dob: "",
sex: "unknown",
phone: "",
});

	const reload = async (): Promise<void> => {
		const query = new URLSearchParams({ search, page: "1", pageSize: "20" });
		setLoadError(null);
		try {
			setPage(await apiFetch<Page<Patient>>(`/api/patients?${query.toString()}`));
		} catch {
			setLoadError("Could not load the registry. Check the network.");
		}
	};

	// Debounce the search so every keystroke doesn't fire a request.
	useEffect(() => {
		const timer = window.setTimeout(() => {
			reload().catch(() => undefined);
		}, 250);
		return () => window.clearTimeout(timer);
	}, [search]);

	const handleCreate = async (event: FormEvent): Promise<void> => {
		event.preventDefault();
		setFormError(null);
		setCreating(true);
		try {
			await apiFetch("/api/patients", {
				method: "POST",
				body: JSON.stringify(form),
			});
			setForm({ name: "", dob: "", sex: "unknown", phone: "" });
			await reload();
			setSearch("");
		} catch (error) {
			setFormError(
				error instanceof Error ? error.message : "Could not create the patient.",
			);
		} finally {
			setCreating(false);
		}
	};

	return (
		<section className="board">
			<div className="board-head">
				<h1 className="board-title">
					Patient registry
					<small>{page !== null ? `${page.total} on the board` : ""}</small>
				</h1>
				<label className="field board-head-search">
					Search
					<input
						className="input"
						placeholder="Search by name or MRN"
						value={search}
						onChange={(e) => setSearch(e.target.value)}
					/>
				</label>
			</div>

			<div className="board-body">
				{loadError !== null && (
					<p className="alert alert-danger" role="alert">
						{loadError}
					</p>
				)}
				{page === null ? (
					<div className="skeleton" aria-label="Loading" />
				) : page.items.length === 0 ? (
					<div className="empty">
						<p className="empty-line">The registry is empty</p>
						<p className="empty-sub">No patients match — add one below.</p>
					</div>
				) : (
					<ul className="ledger">
						{page.items.map((patient) => (
							<li key={patient.id}>
								<Link to={`/patients/${patient.id}`} className="ledger-row">
									<span className="ledger-main">
										<span className="ledger-name">{patient.name}</span>
										<span className="ledger-meta">
											<span className="mrn">{patient.mrn}</span>
											{branchClass(patient.mrn) !== "" && (
												<span
													className={`branch-tag ${branchClass(patient.mrn)}`}
												>
													{patient.mrn.split("-")[0]}
												</span>
											)}
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
				<div className="rule-bar" />

				<h2 className="board-subtitle">New patient</h2>
				<form onSubmit={handleCreate}>
					<div className="field-grid cols-4">
						<label className="field">
							Name
							<input
								className="input"
								placeholder="Name"
								value={form.name}
								onChange={(e) => setForm({ ...form, name: e.target.value })}
								required
							/>
						</label>
						<label className="field">
							Date of birth
							<input
								className="input"
								type="date"
								value={form.dob}
								onChange={(e) => setForm({ ...form, dob: e.target.value })}
								required
							/>
						</label>
						<label className="field">
							Sex
							<select
								className="select"
								value={form.sex}
								onChange={(e) => setForm({ ...form, sex: e.target.value })}
							>
								<option value="unknown">Unknown</option>
								<option value="male">Male</option>
								<option value="female">Female</option>
								<option value="other">Other</option>
							</select>
						</label>
						<label className="field">
							Phone
							<input
								className="input"
								placeholder="Phone"
								value={form.phone}
								onChange={(e) => setForm({ ...form, phone: e.target.value })}
								required
							/>
						</label>
						<span className="field" aria-hidden="true" />
						<button type="submit" className="btn btn-primary" disabled={creating}>
							{creating ? "Creating…" : "Create"}
						</button>
					</div>
				</form>
			</div>
		</section>
	);
};

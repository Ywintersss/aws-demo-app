-- Ships with both RDS PostgreSQL and Aurora PostgreSQL — this is the only
-- non-core-SQL feature this schema uses, and it is not engine-specific.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS branches (
  id   UUID PRIMARY KEY,
  code TEXT NOT NULL UNIQUE CHECK (code IN ('KL', 'PG', 'JB')),
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('doctor', 'nurse', 'records_clerk', 'admin')),
  branch_id     UUID NOT NULL REFERENCES branches (id),
  display_name  TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS patients (
  id         UUID PRIMARY KEY,
  mrn        TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  dob        DATE NOT NULL,
  sex        TEXT NOT NULL CHECK (sex IN ('male', 'female', 'other', 'unknown')),
  phone      TEXT NOT NULL,
  branch_id  UUID NOT NULL REFERENCES branches (id),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS patients_branch_id_idx ON patients (branch_id);
CREATE INDEX IF NOT EXISTS patients_name_trgm_idx ON patients USING gin (name gin_trgm_ops);

CREATE TABLE IF NOT EXISTS encounters (
  id            UUID PRIMARY KEY,
  patient_id    UUID NOT NULL REFERENCES patients (id),
  branch_id     UUID NOT NULL REFERENCES branches (id),
  type          TEXT NOT NULL CHECK (type IN ('outpatient', 'inpatient', 'emergency')),
  department    TEXT NOT NULL,
  admitted_at   TIMESTAMPTZ NOT NULL,
  discharged_at TIMESTAMPTZ,
  status        TEXT NOT NULL CHECK (status IN ('open', 'discharged', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS encounters_patient_id_idx ON encounters (patient_id);

CREATE TABLE IF NOT EXISTS observations (
  id           UUID PRIMARY KEY,
  encounter_id UUID NOT NULL REFERENCES encounters (id),
  code         TEXT NOT NULL CHECK (code IN ('heart_rate', 'blood_pressure', 'temperature', 'spo2', 'weight')),
  value_num    DOUBLE PRECISION,
  value_text   TEXT,
  unit         TEXT,
  recorded_at  TIMESTAMPTZ NOT NULL,
  recorded_by  UUID NOT NULL REFERENCES users (id),
  CONSTRAINT observations_one_value CHECK ((value_num IS NULL) <> (value_text IS NULL))
);

CREATE INDEX IF NOT EXISTS observations_encounter_id_idx ON observations (encounter_id);

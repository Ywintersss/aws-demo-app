import type { Page, Patient } from '@aethelgard/shared';
import type { NewPatient, PatientPatch, PatientRepository, PatientSearchQuery } from '../../../ports/index.js';
import type { Db } from './pool.js';
import { toPatient, type PatientRow } from './rowMappers.js';

const COLUMNS = 'id, mrn, name, dob, sex, phone, branch_id, created_at, updated_at, deleted_at';

const searchParam = (search: string | undefined): string | null => {
  const trimmed = search?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
};

const SEARCH_PREDICATE = `
  deleted_at IS NULL
  AND ($1::text IS NULL OR name ILIKE '%' || $1::text || '%' OR mrn = upper($1::text))`;

export const createPostgresPatientRepository = (db: Db): PatientRepository => ({
  create: async (input: NewPatient): Promise<Patient> => {
    const result = await db.query<PatientRow>(
      `INSERT INTO patients (id, mrn, name, dob, sex, phone, branch_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4::date, $5, $6, $7, $8, $9)
       RETURNING ${COLUMNS}`,
      [input.id, input.mrn, input.name, input.dob, input.sex, input.phone, input.branchId, input.createdAt, input.updatedAt],
    );
    const row = result.rows[0];
    if (row === undefined) throw new Error('INSERT ... RETURNING produced no row for patients');
    return toPatient(row);
  },

  findById: async (id: string): Promise<Patient | null> => {
    const result = await db.query<PatientRow>(
      `SELECT ${COLUMNS} FROM patients WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    return result.rows[0] === undefined ? null : toPatient(result.rows[0]);
  },

  findByMrn: async (mrn: string): Promise<Patient | null> => {
    const result = await db.query<PatientRow>(
      `SELECT ${COLUMNS} FROM patients WHERE mrn = $1 AND deleted_at IS NULL`,
      [mrn],
    );
    return result.rows[0] === undefined ? null : toPatient(result.rows[0]);
  },

  search: async (query: PatientSearchQuery): Promise<Page<Patient>> => {
    const search = searchParam(query.search);
    const offset = (query.page - 1) * query.pageSize;
    const [rows, counted] = await Promise.all([
      db.query<PatientRow>(
        `SELECT ${COLUMNS} FROM patients WHERE ${SEARCH_PREDICATE} ORDER BY name ASC, id ASC LIMIT $2 OFFSET $3`,
        [search, query.pageSize, offset],
      ),
      db.query<{ total: number }>(`SELECT count(*)::bigint AS total FROM patients WHERE ${SEARCH_PREDICATE}`, [search]),
    ]);
    return {
      items: rows.rows.map(toPatient),
      page: query.page,
      pageSize: query.pageSize,
      total: counted.rows[0]?.total ?? 0,
    };
  },

  update: async (id: string, patch: PatientPatch): Promise<Patient | null> => {
    const result = await db.query<PatientRow>(
      `UPDATE patients SET
         name = COALESCE($2::text, name), dob = COALESCE($3::date, dob),
         sex = COALESCE($4::text, sex), phone = COALESCE($5::text, phone), updated_at = $6
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING ${COLUMNS}`,
      [id, patch.name ?? null, patch.dob ?? null, patch.sex ?? null, patch.phone ?? null, patch.updatedAt],
    );
    return result.rows[0] === undefined ? null : toPatient(result.rows[0]);
  },

  softDelete: async (id: string, deletedAt: string): Promise<boolean> => {
    const result = await db.query(
      `UPDATE patients SET deleted_at = $2, updated_at = $2 WHERE id = $1 AND deleted_at IS NULL`,
      [id, deletedAt],
    );
    return (result.rowCount ?? 0) > 0;
  },
});

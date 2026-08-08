import type { Encounter } from '@aethelgard/shared';
import type { EncounterPatch, EncounterRepository, NewEncounter } from '../../../ports/index.js';
import type { Db } from './pool.js';
import { toEncounter, type EncounterRow } from './rowMappers.js';

const COLUMNS = 'id, patient_id, branch_id, type, department, admitted_at, discharged_at, status';

export const createPostgresEncounterRepository = (db: Db): EncounterRepository => ({
  create: async (input: NewEncounter): Promise<Encounter> => {
    const result = await db.query<EncounterRow>(
      `INSERT INTO encounters (id, patient_id, branch_id, type, department, admitted_at, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${COLUMNS}`,
      [input.id, input.patientId, input.branchId, input.type, input.department, input.admittedAt, input.status],
    );
    const row = result.rows[0];
    if (row === undefined) throw new Error('INSERT ... RETURNING produced no row for encounters');
    return toEncounter(row);
  },

  findById: async (id: string): Promise<Encounter | null> => {
    const result = await db.query<EncounterRow>(`SELECT ${COLUMNS} FROM encounters WHERE id = $1`, [id]);
    return result.rows[0] === undefined ? null : toEncounter(result.rows[0]);
  },

  listByPatient: async (patientId: string): Promise<Encounter[]> => {
    const result = await db.query<EncounterRow>(
      `SELECT ${COLUMNS} FROM encounters WHERE patient_id = $1 ORDER BY admitted_at ASC`,
      [patientId],
    );
    return result.rows.map(toEncounter);
  },

  update: async (id: string, patch: EncounterPatch): Promise<Encounter | null> => {
    const result = await db.query<EncounterRow>(
      `UPDATE encounters SET
         department = COALESCE($2::text, department),
         status = COALESCE($3::text, status),
         discharged_at = CASE WHEN $4::boolean THEN $5::timestamptz ELSE discharged_at END
       WHERE id = $1 RETURNING ${COLUMNS}`,
      [id, patch.department ?? null, patch.status ?? null, patch.dischargedAt !== undefined, patch.dischargedAt ?? null],
    );
    return result.rows[0] === undefined ? null : toEncounter(result.rows[0]);
  },
});

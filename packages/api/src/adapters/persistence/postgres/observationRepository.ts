import type { Observation } from '@aethelgard/shared';
import type { NewObservation, ObservationRepository } from '../../../ports/index.js';
import type { Db } from './pool.js';
import { toObservation, type ObservationRow } from './rowMappers.js';

const COLUMNS = 'id, encounter_id, code, value_num, value_text, unit, recorded_at, recorded_by';

export const createPostgresObservationRepository = (db: Db): ObservationRepository => ({
  create: async (input: NewObservation): Promise<Observation> => {
    const result = await db.query<ObservationRow>(
      `INSERT INTO observations (id, encounter_id, code, value_num, value_text, unit, recorded_at, recorded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING ${COLUMNS}`,
      [input.id, input.encounterId, input.code, input.valueNum, input.valueText, input.unit, input.recordedAt, input.recordedBy],
    );
    const row = result.rows[0];
    if (row === undefined) throw new Error('INSERT ... RETURNING produced no row for observations');
    return toObservation(row);
  },

  listByEncounter: async (encounterId: string): Promise<Observation[]> => {
    const result = await db.query<ObservationRow>(
      `SELECT ${COLUMNS} FROM observations WHERE encounter_id = $1 ORDER BY recorded_at ASC`,
      [encounterId],
    );
    return result.rows.map(toObservation);
  },
});

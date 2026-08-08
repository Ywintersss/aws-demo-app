import { describe, expect, it } from 'vitest';
import { createMemoryObservationRepository } from '../../../src/adapters/persistence/memory/observationRepository.js';

describe('createMemoryObservationRepository', () => {
  it('creates an observation and lists it by encounter, oldest first', async () => {
    const repo = createMemoryObservationRepository();
    const encounterId = crypto.randomUUID();
    const first = await repo.create({
      id: crypto.randomUUID(),
      encounterId,
      code: 'heart_rate',
      valueNum: 72,
      valueText: null,
      unit: 'bpm',
      recordedAt: '2026-08-07T00:00:00.000Z',
      recordedBy: crypto.randomUUID(),
    });
    const second = await repo.create({
      id: crypto.randomUUID(),
      encounterId,
      code: 'spo2',
      valueNum: 98,
      valueText: null,
      unit: '%',
      recordedAt: '2026-08-07T01:00:00.000Z',
      recordedBy: crypto.randomUUID(),
    });
    expect(await repo.listByEncounter(encounterId)).toEqual([first, second]);
  });
});

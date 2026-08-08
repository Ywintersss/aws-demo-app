import { describe, expect, it } from 'vitest';
import { createMemoryObservationRepository } from '../../src/adapters/persistence/memory/observationRepository.js';
import { ValidationError } from '../../src/domain/errors.js';
import { createObservationService } from '../../src/services/observationService.js';

const FIXED_NOW = '2026-08-07T12:00:00.000Z';

const buildService = () =>
  createObservationService({
    observations: createMemoryObservationRepository(),
    now: () => FIXED_NOW,
    newId: (() => {
      let n = 0;
      return () => `observation-${(n += 1)}`;
    })(),
  });

describe('observationService', () => {
  it('records a numeric observation stamped with the recorder and current time', async () => {
    const service = buildService();
    const observation = await service.create(
      'encounter-1',
      { code: 'heart_rate', valueNum: 72, unit: 'bpm' },
      'user-1',
    );
    expect(observation.recordedAt).toBe(FIXED_NOW);
    expect(observation.recordedBy).toBe('user-1');
    expect(observation.valueNum).toBe(72);
  });

  it('rejects an out-of-range value before it reaches the repository', async () => {
    const service = buildService();
    await expect(
      service.create('encounter-1', { code: 'spo2', valueNum: 150 }, 'user-1'),
    ).rejects.toThrow(ValidationError);
  });

  it('lists observations for an encounter', async () => {
    const service = buildService();
    await service.create('encounter-1', { code: 'heart_rate', valueNum: 72 }, 'user-1');
    expect(await service.listByEncounter('encounter-1')).toHaveLength(1);
  });
});

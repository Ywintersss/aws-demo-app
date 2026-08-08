import { vi } from 'vitest';
import { createMemoryBranchRepository } from '../../src/adapters/persistence/memory/branchRepository.js';
import { createMemoryPatientRepository } from '../../src/adapters/persistence/memory/patientRepository.js';
import { createMemoryEncounterRepository } from '../../src/adapters/persistence/memory/encounterRepository.js';
import { createMemoryObservationRepository } from '../../src/adapters/persistence/memory/observationRepository.js';
import { createPatientService } from '../../src/services/patientService.js';
import { createEncounterService } from '../../src/services/encounterService.js';
import { createObservationService } from '../../src/services/observationService.js';
import { createAuthService } from '../../src/services/authService.js';
import { buildServer, type ServerDeps } from '../../src/http/server.js';
import type { AuthProvider } from '../../src/ports/index.js';
import type { Db } from '../../src/adapters/persistence/postgres/pool.js';

export const TEST_PRINCIPAL = {
  userId: 'user-1',
  email: 'doctor.kl@aethelgard.demo',
  role: 'doctor' as const,
  branchId: '11111111-1111-4111-8111-111111111111',
};

export const AUTH_HEADER = { authorization: 'Bearer valid-token' };

/** Real services over in-memory adapters, so route tests exercise real validation and business rules — only the AuthProvider and Db are faked. */
export const buildTestServer = () => {
  let sequence = 0;
  const newId = () => `id-${(sequence += 1)}`;
  const now = () => '2026-08-07T12:00:00.000Z';

  const authProvider: AuthProvider = {
    login: vi.fn(async (email: string) =>
      email === TEST_PRINCIPAL.email ? { principal: TEST_PRINCIPAL, token: 'valid-token' } : null,
    ),
    verify: vi.fn(async (token: string) => (token === 'valid-token' ? TEST_PRINCIPAL : null)),
    // role and branchCode both need `as const` — vi.fn() infers its return type from the
    // arrow function's own literal shape, not contextually against AuthProvider's method
    // signature, so a bare 'doctor'/'KL' would otherwise widen to `string`.
    listDemoUsers: vi.fn(async () => [
      { email: TEST_PRINCIPAL.email, role: 'doctor' as const, branchCode: 'KL' as const, displayName: 'Dr Lim' },
    ]),
  };

  const deps: ServerDeps = {
    db: { query: vi.fn(async () => ({ rows: [], rowCount: 0 })), close: vi.fn(), pool: {} } as unknown as Db,
    authProvider,
    instanceId: 'test-instance-1',
    availabilityZone: 'test-az-1',
    appVersion: '0.1.0-test',
    authDriverName: 'localJwt',
    identityDriverName: 'local',
    serveStatic: false,
    patients: createPatientService({ patients: createMemoryPatientRepository(), branches: createMemoryBranchRepository(), now, newId }),
    encounters: createEncounterService({ encounters: createMemoryEncounterRepository(), now, newId }),
    observations: createObservationService({ observations: createMemoryObservationRepository(), now, newId }),
    auth: createAuthService({ authProvider }),
  };

  return { app: buildServer(deps), deps };
};

import type { FastifyInstance } from 'fastify';
import type { AppConfig } from './config/env.js';
import { createDb, type Db } from './adapters/persistence/postgres/pool.js';
import { runMigrations } from './adapters/persistence/postgres/migrator.js';
import { createPostgresBranchRepository } from './adapters/persistence/postgres/branchRepository.js';
import { createPostgresPatientRepository } from './adapters/persistence/postgres/patientRepository.js';
import { createPostgresEncounterRepository } from './adapters/persistence/postgres/encounterRepository.js';
import { createPostgresObservationRepository } from './adapters/persistence/postgres/observationRepository.js';
import { createLocalJwtAuthProvider } from './adapters/auth/localJwt/localJwtAuthProvider.js';
import { createLocalIdentity } from './adapters/identity/localIdentity.js';
import { createEcsIdentity } from './adapters/identity/ecsIdentity.js';
import { createPatientService } from './services/patientService.js';
import { createEncounterService } from './services/encounterService.js';
import { createObservationService } from './services/observationService.js';
import { createAuthService } from './services/authService.js';
import { buildServer } from './http/server.js';

const newId = (): string => crypto.randomUUID();
const now = (): string => new Date().toISOString();

/**
 * The one place a `ports` type and a concrete `adapters` implementation are
 * imported together. Everything this function builds is created here and
 * nowhere else — swapping `AUTH_DRIVER` or `IDENTITY_DRIVER`, or pointing
 * `DATABASE_URL`/`DB_HOST` at Aurora instead of RDS, changes nothing below;
 * `config/env.ts` (Task 1) already resolved those decisions into plain values.
 */
export const buildApplication = async (
  config: AppConfig,
): Promise<{ server: FastifyInstance; db: Db }> => {
  const db = createDb(config.databaseUrl);
  await runMigrations(db, { log: (message) => console.log(message) });

  const branches = createPostgresBranchRepository(db);
  const patientsRepo = createPostgresPatientRepository(db);
  const encountersRepo = createPostgresEncounterRepository(db);
  const observationsRepo = createPostgresObservationRepository(db);

  const authProvider = createLocalJwtAuthProvider(db, config.jwtSecret);
  const identity = config.identityDriver === 'ecs' ? createEcsIdentity() : createLocalIdentity();

  // Resolved once at boot, not per-request — see Task 10's server.ts rationale.
  const [instanceId, availabilityZone] = await Promise.all([
    identity.instanceId(),
    identity.availabilityZone(),
  ]);

  const server = await buildServer({
    db,
    authProvider,
    patients: createPatientService({ patients: patientsRepo, branches, now, newId }),
    encounters: createEncounterService({ encounters: encountersRepo, now, newId }),
    observations: createObservationService({ observations: observationsRepo, now, newId }),
    auth: createAuthService({ authProvider }),
    instanceId,
    availabilityZone,
    appVersion: config.appVersion,
    authDriverName: config.authDriver,
    identityDriverName: config.identityDriver,
    serveStatic: config.serveStatic,
    staticRoot: config.serveStatic ? new URL('../../web/dist', import.meta.url).pathname : undefined,
  });

  return { server, db };
};

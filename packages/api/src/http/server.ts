import Fastify, { type FastifyInstance } from 'fastify';
import type { AuthProvider } from '../ports/index.js';
import type { Db } from '../adapters/persistence/postgres/pool.js';
import type { PatientService } from '../services/patientService.js';
import type { EncounterService } from '../services/encounterService.js';
import type { ObservationService } from '../services/observationService.js';
import type { AuthService } from '../services/authService.js';
import { errorHandler } from './errorMiddleware.js';
import { createRequireAuth } from './authMiddleware.js';
import { registerHealthRoute } from './routes/health.js';
import { registerMetaRoute } from './routes/meta.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerPatientRoutes } from './routes/patients.js';
import { registerEncounterRoutes } from './routes/encounters.js';
import { registerObservationRoutes } from './routes/observations.js';
import { registerAdminRoutes } from './routes/admin.js';

export type ServerDeps = {
  db: Db;
  authProvider: AuthProvider;
  patients: PatientService;
  encounters: EncounterService;
  observations: ObservationService;
  auth: AuthService;
  instanceId: string;
  availabilityZone: string;
  appVersion: string;
  authDriverName: string;
  identityDriverName: string;
  serveStatic: boolean;
  staticRoot?: string;
};

export const buildServer = (deps: ServerDeps): FastifyInstance => {
  const fastify = Fastify({ logger: true, disableRequestLogging: true });

  fastify.decorateRequest('principal', undefined);
  fastify.setErrorHandler(errorHandler);

  fastify.addHook('onSend', async (_request, reply, payload) => {
    reply.header('X-Served-By', deps.instanceId);
    reply.header('X-AZ', deps.availabilityZone);
    return payload;
  });

  const requireAuth = createRequireAuth(deps.authProvider);

  registerHealthRoute(fastify, deps.db);
  registerMetaRoute(fastify, deps, requireAuth);
  registerAuthRoutes(fastify, deps.auth, requireAuth);
  registerPatientRoutes(fastify, deps.patients, requireAuth);
  registerEncounterRoutes(fastify, deps.encounters, requireAuth);
  registerObservationRoutes(fastify, deps.observations, requireAuth);
  registerAdminRoutes(fastify, requireAuth);

  return fastify;
};

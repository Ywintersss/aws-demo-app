import Fastify, { type FastifyInstance } from 'fastify';
import type { AuthProvider } from '../ports/index.js';
import type { Db } from '../adapters/persistence/postgres/pool.js';
import { errorHandler } from './errorMiddleware.js';
import { createRequireAuth } from './authMiddleware.js';
import { registerHealthRoute } from './routes/health.js';
import { registerMetaRoute } from './routes/meta.js';

export type ServerDeps = {
  db: Db;
  authProvider: AuthProvider;
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

  // X-Served-By / X-AZ on every response — instance identity resolved once at
  // boot (Task 12), so this is a synchronous header set, never an await per request.
  fastify.addHook('onSend', async (_request, reply, payload) => {
    reply.header('X-Served-By', deps.instanceId);
    reply.header('X-AZ', deps.availabilityZone);
    return payload;
  });

  const requireAuth = createRequireAuth(deps.authProvider);

  registerHealthRoute(fastify, deps.db);
  registerMetaRoute(fastify, deps, requireAuth);

  return fastify;
};

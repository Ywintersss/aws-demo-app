import type { FastifyInstance } from 'fastify';
import { setForcedUnhealthy } from '../healthState.js';
import type { createRequireAuth } from '../authMiddleware.js';

const BURN_DURATION_MS = 2000;

export const registerAdminRoutes = (
  fastify: FastifyInstance,
  requireAuth: ReturnType<typeof createRequireAuth>,
): void => {
  fastify.post('/api/admin/health/fail', { preHandler: requireAuth }, async (_request, reply) => {
    setForcedUnhealthy(true);
    reply.code(200).send({ forcedUnhealthy: true });
  });

  fastify.post('/api/admin/health/recover', { preHandler: requireAuth }, async (_request, reply) => {
    setForcedUnhealthy(false);
    reply.code(200).send({ forcedUnhealthy: false });
  });

  fastify.post('/api/admin/load/burn', { preHandler: requireAuth }, async (_request, reply) => {
    const end = Date.now() + BURN_DURATION_MS;
    while (Date.now() < end) {
      Math.sqrt(Math.random());
    }
    reply.code(200).send({ burnedMs: BURN_DURATION_MS });
  });
};

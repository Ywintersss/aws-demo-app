import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { setForcedUnhealthy } from '../healthState.js';
import { parseWith } from '../validate.js';
import type { createRequireAuth } from '../authMiddleware.js';

const DEFAULT_BURN_MS = 2000;

/**
 * Ceiling on a single burn, and the reason for it: the burn loop is synchronous,
 * so it blocks Node's event loop and this task cannot answer `GET /health` until
 * it finishes. The ALB target group's health check timeout is 5s — a burn longer
 * than that guarantees a missed check, and two missed checks deregister the task
 * and have ECS replace it. Sustained load must therefore come from *concurrent
 * short burns* (see `scripts/loadTest.ts`), never from one long one.
 */
const MAX_BURN_MS = 5000;

const burnRequestSchema = z.object({
  durationMs: z.number().int().min(1).max(MAX_BURN_MS).optional(),
});

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

  fastify.post('/api/admin/load/burn', { preHandler: requireAuth }, async (request, reply) => {
    // The InfraPage button posts no body at all, so an absent body means "default".
    const { durationMs } = parseWith(burnRequestSchema, request.body ?? {});
    const burnMs = durationMs ?? DEFAULT_BURN_MS;

    const end = Date.now() + burnMs;
    while (Date.now() < end) {
      Math.sqrt(Math.random());
    }
    reply.code(200).send({ burnedMs: burnMs });
  });
};

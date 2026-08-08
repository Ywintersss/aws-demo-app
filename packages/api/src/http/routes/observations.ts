import type { FastifyInstance } from 'fastify';
import { createObservationSchema } from '@aethelgard/shared';
import type { ObservationService } from '../../services/observationService.js';
import { parseWith } from '../validate.js';
import type { createRequireAuth } from '../authMiddleware.js';

export const registerObservationRoutes = (
  fastify: FastifyInstance,
  observations: ObservationService,
  requireAuth: ReturnType<typeof createRequireAuth>,
): void => {
  fastify.get('/api/encounters/:encounterId/observations', { preHandler: requireAuth }, async (request, reply) => {
    const { encounterId } = request.params as { encounterId: string };
    reply.send(await observations.listByEncounter(encounterId));
  });

  fastify.post('/api/encounters/:encounterId/observations', { preHandler: requireAuth }, async (request, reply) => {
    const { encounterId } = request.params as { encounterId: string };
    const input = parseWith(createObservationSchema, request.body);
    const observation = await observations.create(encounterId, input, request.principal!.userId);
    reply.code(201).send(observation);
  });
};

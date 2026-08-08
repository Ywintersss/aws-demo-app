import type { FastifyInstance } from 'fastify';
import { createEncounterSchema, patchEncounterSchema } from '@aethelgard/shared';
import type { EncounterService } from '../../services/encounterService.js';
import { parseWith } from '../validate.js';
import type { createRequireAuth } from '../authMiddleware.js';

export const registerEncounterRoutes = (
  fastify: FastifyInstance,
  encounters: EncounterService,
  requireAuth: ReturnType<typeof createRequireAuth>,
): void => {
  fastify.get('/api/patients/:patientId/encounters', { preHandler: requireAuth }, async (request, reply) => {
    const { patientId } = request.params as { patientId: string };
    reply.send(await encounters.listByPatient(patientId));
  });

  fastify.post('/api/patients/:patientId/encounters', { preHandler: requireAuth }, async (request, reply) => {
    const { patientId } = request.params as { patientId: string };
    const input = parseWith(createEncounterSchema, request.body);
    const encounter = await encounters.create(patientId, input, request.principal!.branchId);
    reply.code(201).send(encounter);
  });

  fastify.get('/api/encounters/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    reply.send(await encounters.get(id));
  });

  fastify.patch('/api/encounters/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const patch = parseWith(patchEncounterSchema, request.body);
    reply.send(await encounters.update(id, patch));
  });
};

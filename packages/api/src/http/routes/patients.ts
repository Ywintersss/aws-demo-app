import type { FastifyInstance } from 'fastify';
import { createPatientSchema, paginationQuerySchema, updatePatientSchema } from '@aethelgard/shared';
import type { PatientService } from '../../services/patientService.js';
import { parseWith } from '../validate.js';
import type { createRequireAuth } from '../authMiddleware.js';

export const registerPatientRoutes = (
  fastify: FastifyInstance,
  patients: PatientService,
  requireAuth: ReturnType<typeof createRequireAuth>,
): void => {
  fastify.get('/api/patients', { preHandler: requireAuth }, async (request, reply) => {
    const query = parseWith(paginationQuerySchema, request.query);
    const search = (request.query as { search?: string }).search;
    reply.send(await patients.search({ ...query, search }));
  });

  fastify.post('/api/patients', { preHandler: requireAuth }, async (request, reply) => {
    const input = parseWith(createPatientSchema, request.body);
    const patient = await patients.create(input, request.principal!.branchId);
    reply.code(201).send(patient);
  });

  fastify.get('/api/patients/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    reply.send(await patients.get(id));
  });

  fastify.patch('/api/patients/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const patch = parseWith(updatePatientSchema, request.body);
    reply.send(await patients.update(id, patch));
  });

  fastify.delete('/api/patients/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await patients.remove(id);
    reply.code(204).send();
  });
};

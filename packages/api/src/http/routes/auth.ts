import type { FastifyInstance } from 'fastify';
import { loginSchema } from '@aethelgard/shared';
import type { AuthService } from '../../services/authService.js';
import { parseWith } from '../validate.js';
import type { createRequireAuth } from '../authMiddleware.js';

export const registerAuthRoutes = (
  fastify: FastifyInstance,
  auth: AuthService,
  requireAuth: ReturnType<typeof createRequireAuth>,
): void => {
  fastify.post('/api/auth/login', async (request, reply) => {
    const input = parseWith(loginSchema, request.body);
    const result = await auth.login(input);
    reply.code(200).send(result);
  });

  fastify.get('/api/auth/demo-users', async (_request, reply) => {
    reply.send(await auth.demoUsers());
  });

  fastify.get('/api/auth/me', { preHandler: requireAuth }, async (request, reply) => {
    reply.send(request.principal);
  });
};

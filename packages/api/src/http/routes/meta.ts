import type { FastifyInstance } from 'fastify';
import type { ServerDeps } from '../server.js';
import type { createRequireAuth } from '../authMiddleware.js';

export const registerMetaRoute = (
  fastify: FastifyInstance,
  deps: Pick<ServerDeps, 'instanceId' | 'availabilityZone' | 'appVersion' | 'authDriverName' | 'identityDriverName'>,
  requireAuth: ReturnType<typeof createRequireAuth>,
): void => {
  fastify.get('/api/meta', { preHandler: requireAuth }, async (_request, reply) => {
    reply.send({
      instanceId: deps.instanceId,
      availabilityZone: deps.availabilityZone,
      version: deps.appVersion,
      uptimeSeconds: process.uptime(),
      adapters: { db: 'postgres', auth: deps.authDriverName, identity: deps.identityDriverName },
    });
  });
};

import type { FastifyInstance } from 'fastify';
import type { Db } from '../../adapters/persistence/postgres/pool.js';
import { isForcedUnhealthy } from '../healthState.js';

export const registerHealthRoute = (fastify: FastifyInstance, db: Db): void => {
  fastify.get('/health', async (request, reply) => {
    if (isForcedUnhealthy()) {
      reply.code(503).send({ status: 'unhealthy', reason: 'forced' });
      return;
    }
    try {
      await db.query('SELECT 1');
      reply.code(200).send({ status: 'ok' });
    } catch (error) {
      request.log.error({ err: error }, 'health check database query failed');
      reply.code(503).send({ status: 'unhealthy', reason: 'database' });
    }
  });
};

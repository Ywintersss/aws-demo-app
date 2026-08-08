import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Principal } from '@aethelgard/shared';
import type { AuthProvider } from '../ports/index.js';

declare module 'fastify' {
  interface FastifyRequest {
    principal?: Principal;
  }
}

export const createRequireAuth =
  (authProvider: AuthProvider) =>
  async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const header = request.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;
    if (token === undefined) {
      await reply.code(401).send({ code: 'UNAUTHENTICATED', message: 'Missing bearer token' });
      return;
    }
    const principal = await authProvider.verify(token);
    if (principal === null) {
      await reply.code(401).send({ code: 'UNAUTHENTICATED', message: 'Invalid or expired token' });
      return;
    }
    request.principal = principal;
  };

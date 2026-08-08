import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { isDomainError } from '../domain/errors.js';

export const errorHandler = (error: FastifyError | Error, request: FastifyRequest, reply: FastifyReply): void => {
  if (isDomainError(error)) {
    reply.code(error.httpStatus).send({
      code: error.code,
      message: error.message,
      details: error.details,
      requestId: request.id,
    });
    return;
  }
  request.log.error({ err: error }, 'unhandled error');
  reply.code(500).send({ code: 'INTERNAL_ERROR', message: 'Something went wrong', requestId: request.id });
};

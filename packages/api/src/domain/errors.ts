export abstract class DomainError extends Error {
  abstract readonly code: string;
  abstract readonly httpStatus: number;
  readonly details: Record<string, unknown>;

  protected constructor(message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = this.constructor.name;
    this.details = details;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

export class NotFoundError extends DomainError {
  readonly code = 'NOT_FOUND';
  readonly httpStatus = 404;
  constructor(entityType: string, id: string) {
    super(`${entityType} ${id} was not found`, { entityType, id });
  }
}

export class ValidationError extends DomainError {
  readonly code = 'VALIDATION_FAILED';
  readonly httpStatus = 400;
  constructor(message: string, details: Record<string, unknown> = {}) {
    super(message, details);
  }
}

/** Never carries details by construction — a 403 must not reveal whether the resource exists. */
export class ForbiddenError extends DomainError {
  readonly code = 'FORBIDDEN';
  readonly httpStatus = 403;
  constructor(message = 'Access denied') {
    super(message);
  }
}

export class ConflictError extends DomainError {
  readonly code = 'CONFLICT';
  readonly httpStatus = 409;
  constructor(message: string, details: Record<string, unknown> = {}) {
    super(message, details);
  }
}

export class UpstreamError extends DomainError {
  readonly code = 'UPSTREAM_FAILED';
  readonly httpStatus = 502;
  constructor(message: string, cause: unknown) {
    super(message);
    this.cause = cause;
  }
}

export const isDomainError = (value: unknown): value is DomainError =>
  value instanceof DomainError;

import { describe, expect, it } from 'vitest';
import {
  ConflictError,
  DomainError,
  ForbiddenError,
  NotFoundError,
  UpstreamError,
  ValidationError,
  isDomainError,
} from '../../src/domain/errors.js';

describe('NotFoundError', () => {
  it('carries a 404 status and a machine-readable code', () => {
    const error = new NotFoundError('patient', 'abc');
    expect(error.httpStatus).toBe(404);
    expect(error.code).toBe('NOT_FOUND');
    expect(error.message).toBe('patient abc was not found');
    expect(error.details).toEqual({ entityType: 'patient', id: 'abc' });
  });

  it('is a real Error subclass so instanceof and stack traces both work', () => {
    const error = new NotFoundError('patient', 'abc');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(DomainError);
    expect(error.name).toBe('NotFoundError');
  });
});

describe('ValidationError', () => {
  it('carries a 400 status and field-level detail', () => {
    const error = new ValidationError('bad dob', { field: 'dob' });
    expect(error.httpStatus).toBe(400);
    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.details).toEqual({ field: 'dob' });
  });
});

describe('ForbiddenError', () => {
  it('carries a 403 status and never leaks details', () => {
    expect(new ForbiddenError().httpStatus).toBe(403);
    expect(new ForbiddenError().message).toBe('Access denied');
    expect(new ForbiddenError('custom').details).toEqual({});
  });
});

describe('ConflictError', () => {
  it('carries a 409 status', () => {
    const error = new ConflictError('MRN already assigned', { mrn: 'KL-000123' });
    expect(error.httpStatus).toBe(409);
    expect(error.details).toEqual({ mrn: 'KL-000123' });
  });
});

describe('UpstreamError', () => {
  it('carries a 502 status and preserves the cause', () => {
    const cause = new Error('ECONNREFUSED');
    const error = new UpstreamError('db unreachable', cause);
    expect(error.httpStatus).toBe(502);
    expect(error.cause).toBe(cause);
  });
});

describe('isDomainError', () => {
  it('recognises domain errors and rejects everything else', () => {
    expect(isDomainError(new NotFoundError('patient', 'a'))).toBe(true);
    expect(isDomainError(new Error('boom'))).toBe(false);
    expect(isDomainError(null)).toBe(false);
  });
});

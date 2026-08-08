import type { ZodType } from 'zod';
import { ValidationError } from '../domain/errors.js';

export const parseWith = <T>(schema: ZodType<T>, value: unknown): T => {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ValidationError('Request failed validation', {
      issues: result.error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
    });
  }
  return result.data;
};

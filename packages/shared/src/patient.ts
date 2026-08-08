import { z } from 'zod';
import { sexSchema } from './enums.js';

export const mrnSchema = z
  .string()
  .regex(/^(?:KL|PG|JB)-\d{6}$/, 'MRN must be a branch code, a hyphen, and six digits');

export const patientSchema = z.object({
  id: z.uuid(),
  mrn: mrnSchema,
  name: z.string().min(1).max(200),
  dob: z.iso.date(),
  sex: sexSchema,
  phone: z.string().min(6).max(30),
  branchId: z.uuid(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  deletedAt: z.iso.datetime().nullable(),
});
export type Patient = z.infer<typeof patientSchema>;

export const createPatientSchema = z
  .object({
    name: z.string().min(1).max(200),
    dob: z.iso.date(),
    sex: sexSchema,
    phone: z.string().min(6).max(30),
    branchId: z.uuid().optional(),
  })
  .strip();
export type CreatePatientInput = z.infer<typeof createPatientSchema>;

export const updatePatientSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    dob: z.iso.date().optional(),
    sex: sexSchema.optional(),
    phone: z.string().min(6).max(30).optional(),
  })
  .strip()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: 'At least one field must be supplied',
  });
export type UpdatePatientInput = z.infer<typeof updatePatientSchema>;

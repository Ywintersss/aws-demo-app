import { z } from 'zod';
import { encounterStatusSchema, encounterTypeSchema } from './enums.js';

export const encounterSchema = z.object({
  id: z.uuid(),
  patientId: z.uuid(),
  branchId: z.uuid(),
  type: encounterTypeSchema,
  department: z.string().min(1).max(120),
  admittedAt: z.iso.datetime(),
  dischargedAt: z.iso.datetime().nullable(),
  status: encounterStatusSchema,
});
export type Encounter = z.infer<typeof encounterSchema>;

export const createEncounterSchema = z
  .object({
    type: encounterTypeSchema,
    department: z.string().min(1).max(120),
    admittedAt: z.iso.datetime().optional(),
    status: encounterStatusSchema.default('open'),
  })
  .strip();
export type CreateEncounterInput = z.infer<typeof createEncounterSchema>;

export const patchEncounterSchema = z
  .object({
    department: z.string().min(1).max(120).optional(),
    status: encounterStatusSchema.optional(),
    dischargedAt: z.iso.datetime().optional(),
  })
  .strip()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: 'At least one field must be supplied',
  });
export type PatchEncounterInput = z.infer<typeof patchEncounterSchema>;

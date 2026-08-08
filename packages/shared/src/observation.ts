import { z } from 'zod';
import { observationCodeSchema } from './enums.js';

export const observationSchema = z.object({
  id: z.uuid(),
  encounterId: z.uuid(),
  code: observationCodeSchema,
  valueNum: z.number().nullable(),
  valueText: z.string().nullable(),
  unit: z.string().max(20).nullable(),
  recordedAt: z.iso.datetime(),
  recordedBy: z.uuid(),
});
export type Observation = z.infer<typeof observationSchema>;

export const createObservationSchema = z
  .object({
    code: observationCodeSchema,
    valueNum: z.number().optional(),
    valueText: z.string().min(1).max(200).optional(),
    unit: z.string().max(20).optional(),
    recordedAt: z.iso.datetime().optional(),
  })
  .strip()
  .refine((input) => input.valueNum !== undefined || input.valueText !== undefined, {
    message: 'An observation must carry either valueNum or valueText',
  });
export type CreateObservationInput = z.infer<typeof createObservationSchema>;

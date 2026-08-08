import { z } from 'zod';
import { branchCodeSchema } from './enums.js';

export const branchSchema = z.object({
  id: z.uuid(),
  code: branchCodeSchema,
  name: z.string().min(1).max(120),
});
export type Branch = z.infer<typeof branchSchema>;

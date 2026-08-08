import { z } from 'zod';
import { branchCodeSchema, roleSchema } from './enums.js';

export const principalSchema = z.object({
  userId: z.uuid(),
  email: z.email(),
  role: roleSchema,
  branchId: z.uuid(),
});
export type Principal = z.infer<typeof principalSchema>;

export const loginSchema = z
  .object({ email: z.email(), password: z.string().min(8).max(200) })
  .strip();
export type LoginInput = z.infer<typeof loginSchema>;

export const demoUserSchema = z
  .object({
    email: z.email(),
    role: roleSchema,
    branchCode: branchCodeSchema,
    displayName: z.string().min(1).max(120),
  })
  .strip();
export type DemoUser = z.infer<typeof demoUserSchema>;

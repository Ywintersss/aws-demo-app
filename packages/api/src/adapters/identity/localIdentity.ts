import { hostname } from 'node:os';
import type { InstanceIdentity } from '../../ports/index.js';

/** Docker Compose sets the container hostname explicitly (see Task 18) — this is what makes X-Served-By rotate locally without AWS. */
export const createLocalIdentity = (): InstanceIdentity => ({
  instanceId: async () => hostname(),
  availabilityZone: async () => 'local',
});

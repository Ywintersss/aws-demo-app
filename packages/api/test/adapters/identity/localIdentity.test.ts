import { hostname } from 'node:os';
import { describe, expect, it } from 'vitest';
import { createLocalIdentity } from '../../../src/adapters/identity/localIdentity.js';

describe('createLocalIdentity', () => {
  it('reports the container/host hostname as the instance id', async () => {
    const identity = createLocalIdentity();
    expect(await identity.instanceId()).toBe(hostname());
  });

  it('reports a fixed local availability zone label', async () => {
    const identity = createLocalIdentity();
    expect(await identity.availabilityZone()).toBe('local');
  });
});

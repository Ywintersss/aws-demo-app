import { afterEach, describe, expect, it, vi } from 'vitest';
import { UpstreamError } from '../../../src/domain/errors.js';
import { createEcsIdentity } from '../../../src/adapters/identity/ecsIdentity.js';

const ORIGINAL_ENV = process.env.ECS_CONTAINER_METADATA_URI_V4;

describe('createEcsIdentity', () => {
  afterEach(() => {
    process.env.ECS_CONTAINER_METADATA_URI_V4 = ORIGINAL_ENV;
  });

  it('parses the task ARN and availability zone from the ECS metadata endpoint', async () => {
    process.env.ECS_CONTAINER_METADATA_URI_V4 = 'http://169.254.170.2/v4/abc123';
    const fakeFetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          TaskARN: 'arn:aws:ecs:us-east-1:111111111111:task/aethelgard-demo/abc123',
          AvailabilityZone: 'us-east-1a',
        }),
        { status: 200 },
      ),
    );
    const identity = createEcsIdentity(fakeFetch as unknown as typeof fetch);
    expect(await identity.instanceId()).toBe('abc123');
    expect(await identity.availabilityZone()).toBe('us-east-1a');
    expect(fakeFetch).toHaveBeenCalledWith('http://169.254.170.2/v4/abc123/task');
  });

  it('throws UpstreamError when the metadata endpoint is unset', async () => {
    delete process.env.ECS_CONTAINER_METADATA_URI_V4;
    const identity = createEcsIdentity();
    await expect(identity.instanceId()).rejects.toThrow(UpstreamError);
  });

  it('throws UpstreamError when the metadata endpoint responds with an error', async () => {
    process.env.ECS_CONTAINER_METADATA_URI_V4 = 'http://169.254.170.2/v4/abc123';
    const fakeFetch = vi.fn(async () => new Response('', { status: 500 }));
    const identity = createEcsIdentity(fakeFetch as unknown as typeof fetch);
    await expect(identity.instanceId()).rejects.toThrow(UpstreamError);
  });
});

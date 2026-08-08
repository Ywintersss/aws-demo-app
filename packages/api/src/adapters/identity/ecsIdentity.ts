import { UpstreamError } from '../../domain/errors.js';
import type { InstanceIdentity } from '../../ports/index.js';

type EcsTaskMetadata = { TaskARN: string; AvailabilityZone: string };

const parseTaskId = (taskArn: string): string => taskArn.split('/').at(-1) ?? taskArn;

const fetchTaskMetadata = async (fetchImpl: typeof fetch): Promise<EcsTaskMetadata> => {
  const base = process.env.ECS_CONTAINER_METADATA_URI_V4;
  if (base === undefined || base === '') {
    throw new UpstreamError(
      'ECS_CONTAINER_METADATA_URI_V4 is not set — IDENTITY_DRIVER=ecs requires the ECS task metadata endpoint',
      null,
    );
  }
  let response: Response;
  try {
    response = await fetchImpl(`${base}/task`);
  } catch (error) {
    throw new UpstreamError('Could not reach the ECS task metadata endpoint', error);
  }
  if (!response.ok) {
    throw new UpstreamError(`ECS task metadata endpoint returned HTTP ${response.status}`, null);
  }
  return (await response.json()) as EcsTaskMetadata;
};

/**
 * Reads ECS_CONTAINER_METADATA_URI_V4 (present on every Fargate and EC2-launch-type
 * ECS task — this adapter does not care which). `fetchImpl` is injectable for tests.
 */
export const createEcsIdentity = (fetchImpl: typeof fetch = fetch): InstanceIdentity => ({
  instanceId: async () => parseTaskId((await fetchTaskMetadata(fetchImpl)).TaskARN),
  availabilityZone: async () => (await fetchTaskMetadata(fetchImpl)).AvailabilityZone,
});

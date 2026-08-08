export type InstanceIdentity = {
  instanceId(): Promise<string>;
  availabilityZone(): Promise<string>;
};

let forcedUnhealthy = false;

export const isForcedUnhealthy = (): boolean => forcedUnhealthy;
export const setForcedUnhealthy = (value: boolean): void => {
  forcedUnhealthy = value;
};

import type { FilterStatus } from './AegisFilter.types';

/**
 * Web has no way to filter DNS, so this reports that honestly rather than
 * pretending. `expo start --web` is used for layout work; a build that claimed
 * protection there would be lying to whoever was looking at it.
 */
export default {
  hasPermission: (): boolean => false,
  requestPermission: async (): Promise<boolean> => false,
  start: async (): Promise<boolean> => {
    throw new Error('Filtering is not available on web.');
  },
  stop: async (): Promise<boolean> => false,
  status: (): FilterStatus => ({ running: false, revoked: false, blockedCount: 0 }),
  addListener: () => ({ remove: () => {} }),
};

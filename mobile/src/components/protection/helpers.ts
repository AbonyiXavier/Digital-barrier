import { PROTECTION_LEVELS, type ProtectionLevelId } from '@/types';

export function levelById(id: ProtectionLevelId) {
  return PROTECTION_LEVELS.find((level) => level.id === id) ?? PROTECTION_LEVELS[0];
}

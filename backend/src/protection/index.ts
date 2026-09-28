export { CATEGORY_IDS, CATEGORY_REFS, categoryById, categoryIdFor, type CategoryRef } from './categories';
export {
  LOCK_LEVEL,
  LOCK_LEVELS,
  WAITING_PERIOD_MINUTES,
  isDirectlyReleasable,
  requiresRequest,
  type LockLevel,
} from './lock-levels';
export { ProtectionModule } from './protection.module';
export { ProtectionService } from './protection.service';
export { ensureProtection, type Db } from './protection-row';
export { toProtectionView, ProtectionStateView } from './protection.view';

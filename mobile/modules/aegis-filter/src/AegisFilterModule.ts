import { NativeModule, requireNativeModule } from 'expo';

import type { AegisFilterEvents, FilterStatus } from './AegisFilter.types';

declare class AegisFilterModule extends NativeModule<AegisFilterEvents> {
  /** Has the user granted VPN consent? */
  hasPermission(): boolean;
  /**
   * Shows the system consent dialog.
   *
   * Resolves true when consent was already granted. Otherwise it resolves false
   * having *launched* the dialog — the answer arrives as an Activity result, so
   * callers should re-read `hasPermission()` once the app is foregrounded again
   * rather than await a verdict across a context switch.
   */
  requestPermission(): Promise<boolean>;
  /** Starts filtering against a compiled blocklist already on disk. */
  start(blocklistPath: string, upstream?: string): Promise<boolean>;
  stop(): Promise<boolean>;
  status(): FilterStatus;
}

export default requireNativeModule<AegisFilterModule>('AegisFilter');

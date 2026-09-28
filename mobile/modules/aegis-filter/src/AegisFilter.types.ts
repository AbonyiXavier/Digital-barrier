/** What the native side reports about the tunnel. */
export interface FilterStatus {
  /** The tunnel is established and answering queries. */
  running: boolean;
  /**
   * Another VPN took the slot.
   *
   * Android allows one active VPN at a time, so this is the Android shape of the
   * bypass the macOS client watches for — and the event worth telling an
   * accountability partner about.
   */
  revoked: boolean;
  /** Blocks since the service started. A count, never a name. */
  blockedCount: number;
}

/**
 * A type alias rather than an interface: Expo's `EventsMap` constraint needs an
 * implicit index signature, which interfaces do not get.
 */
export type AegisFilterEvents = {
  onRevoked: () => void;
};

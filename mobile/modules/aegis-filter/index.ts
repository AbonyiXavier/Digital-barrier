/**
 * On-device DNS filtering.
 *
 * Android is implemented (VpnService). iOS is not: it needs an
 * NEPacketTunnelProvider and a paid Apple Developer account for the Network
 * Extension entitlement, so the Swift side is a stub that reports unavailable
 * rather than a shell that silently does nothing.
 */
export { default } from './src/AegisFilterModule';
export type { AegisFilterEvents, FilterStatus } from './src/AegisFilter.types';

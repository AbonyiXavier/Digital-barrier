export { DevicesModule } from './devices.module';
export { DevicesService, type ExpectedConfig, type PairingCodeView } from './devices.service';
export {
  CODE_ALPHABET,
  CODE_LENGTH,
  CODE_TTL_MS,
  PAIRING_CODE_PATTERN,
  generatePairingCode,
  normalisePairingCode,
} from './pairing-code';
export type {
  DevicePlatformWire,
  DeviceStatusWire,
  DeviceView,
  ProtectionCategoryWire,
} from './device-wire';

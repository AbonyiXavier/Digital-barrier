import type { BadgeTone, IconName } from '@/components/ui';
import type { DeviceStatus } from '@/types';

export type DeviceStatusBadge = { label: string; tone: BadgeTone; icon: IconName };

/** One mapping, so the list and the detail screen never disagree. */
export function statusBadge(status: DeviceStatus): DeviceStatusBadge {
  switch (status) {
    case 'protected':
      return { label: 'Protected', tone: 'shield', icon: 'shield-checkmark' };
    case 'paused':
      return { label: 'Paused', tone: 'warn', icon: 'pause' };
    case 'offline':
      return { label: 'Offline', tone: 'neutral', icon: 'cloud-offline-outline' };
    case 'needs-setup':
      return { label: 'Needs setup', tone: 'warn', icon: 'alert-circle' };
  }
}

/** The line under a device's name on its detail screen. */
export function statusDetail(status: DeviceStatus): string {
  switch (status) {
    case 'protected':
      return 'Filtering is running on this device.';
    case 'paused':
      return 'Filtering is paused. Nothing is being blocked here.';
    case 'offline':
      return 'This device has not checked in recently.';
    case 'needs-setup':
      return 'One step left before this device is covered.';
  }
}

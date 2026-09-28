import { View } from 'react-native';

import { Icon } from '@/components/ui';
import { platformIcon } from '@/lib/format';
import { useTheme } from '@/theme';
import type { DevicePlatform } from '@/types';

export type PlatformChipProps = {
  platform: DevicePlatform;
  size?: number;
  tint?: string;
};

/** A device's platform icon in a tinted square — list rows and the detail hero. */
export function PlatformChip({ platform, size = 44, tint }: PlatformChipProps) {
  const theme = useTheme();
  const color = tint ?? theme.colors.brand;

  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: size >= 64 ? theme.radius.lg : theme.radius.md,
        backgroundColor: `${color}1F`,
      }}>
      <Icon name={platformIcon(platform)} size={size >= 64 ? 30 : 21} color={color} />
    </View>
  );
}

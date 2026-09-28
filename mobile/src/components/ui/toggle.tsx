import * as Haptics from 'expo-haptics';
import { Platform, Switch as RNSwitch } from 'react-native';

import { useTheme } from '@/theme';

export type ToggleProps = {
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
  /** Tint when on. Defaults to the shield colour, since most toggles here
   *  are "is this protection turned on". */
  tone?: 'shield' | 'brand';
  accessibilityLabel?: string;
};

export function Toggle({
  value,
  onValueChange,
  disabled = false,
  tone = 'shield',
  accessibilityLabel,
}: ToggleProps) {
  const theme = useTheme();
  const on = tone === 'brand' ? theme.colors.brand : theme.colors.shield;

  return (
    <RNSwitch
      value={value}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
      onValueChange={(next) => {
        if (Platform.OS !== 'web') {
          Haptics.selectionAsync().catch(() => {});
        }
        onValueChange(next);
      }}
      trackColor={{ false: theme.colors.surfacePressed, true: on }}
      thumbColor={Platform.OS === 'android' ? theme.colors.surface : undefined}
      ios_backgroundColor={theme.colors.surfacePressed}
      style={{ opacity: disabled ? 0.5 : 1 }}
    />
  );
}

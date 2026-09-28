import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

import { Icon, type IconName } from './icon';
import { Text } from './text';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'shield';
export type ButtonSize = 'sm' | 'base' | 'lg';

export type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  /** Put the icon after the label instead of before it. */
  iconTrailing?: boolean;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
};

const heights: Record<ButtonSize, number> = { sm: 38, base: 50, lg: 58 };
const paddings: Record<ButtonSize, number> = { sm: 14, base: 20, lg: 24 };

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'base',
  icon,
  iconTrailing = false,
  disabled = false,
  loading = false,
  fullWidth = true,
  style,
}: ButtonProps) {
  const theme = useTheme();
  const { colors } = theme;

  const gradient =
    variant === 'primary'
      ? colors.brandGradient
      : variant === 'shield'
        ? colors.shieldGradient
        : null;

  const background =
    variant === 'secondary'
      ? colors.surfaceAlt
      : variant === 'danger'
        ? colors.dangerSoft
        : 'transparent';

  const contentColor =
    variant === 'primary' || variant === 'shield'
      ? colors.textOnAccent
      : variant === 'danger'
        ? colors.danger
        : variant === 'ghost'
          ? colors.brand
          : colors.text;

  const handlePress = () => {
    if (disabled || loading) return;
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    onPress?.();
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      onPress={handlePress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        {
          height: heights[size],
          paddingHorizontal: paddings[size],
          borderRadius: theme.radius.full,
          backgroundColor: background,
          borderWidth: variant === 'ghost' ? 0 : 0,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          opacity: disabled ? 0.45 : pressed ? 0.9 : 1,
          transform: [{ scale: pressed ? 0.985 : 1 }],
        },
        style,
      ]}>
      {gradient ? (
        <LinearGradient
          colors={gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      ) : null}

      {loading ? (
        <ActivityIndicator color={contentColor} />
      ) : (
        <View style={[styles.row, iconTrailing && styles.rowReverse]}>
          {icon ? <Icon name={icon} size={size === 'sm' ? 16 : 18} color={contentColor} /> : null}
          <Text
            variant={size === 'sm' ? 'caption' : 'bodyStrong'}
            style={{ color: contentColor }}
            numberOfLines={1}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowReverse: { flexDirection: 'row-reverse' },
});

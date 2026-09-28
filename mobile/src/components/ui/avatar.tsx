import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

import { Text } from './text';

export type AvatarProps = {
  initials: string;
  size?: number;
  /** Dims the avatar and adds a dashed ring — used for pending invites. */
  pending?: boolean;
};

export function Avatar({ initials, size = 44, pending = false }: AvatarProps) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.root,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: pending ? 1.5 : 0,
          borderColor: theme.colors.borderStrong,
          borderStyle: pending ? 'dashed' : 'solid',
          opacity: pending ? 0.8 : 1,
        },
      ]}>
      {!pending ? (
        <LinearGradient
          colors={theme.colors.brandGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      <Text
        variant={size >= 44 ? 'bodyStrong' : 'caption'}
        style={{ color: pending ? theme.colors.textSecondary : theme.colors.textOnAccent }}>
        {initials}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});

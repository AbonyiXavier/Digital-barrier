import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

export type StrengthMeterProps = {
  /** How many bars are filled, 1–4. */
  value: number;
  max?: number;
  /** Bar height; the width flexes. */
  height?: number;
};

/**
 * Four bars showing how hard the current Protection Lock is to get past.
 * Colour walks coral → amber → mint as the lock gets stronger.
 */
export function StrengthMeter({ value, max = 4, height = 6 }: StrengthMeterProps) {
  const theme = useTheme();
  const tone =
    value <= 1 ? theme.colors.danger : value === 2 ? theme.colors.warn : theme.colors.shield;

  return (
    <View style={[styles.row, { gap: 5 }]}>
      {Array.from({ length: max }, (_, index) => (
        <View
          key={index}
          style={{
            flex: 1,
            height,
            borderRadius: height / 2,
            backgroundColor: index < value ? tone : theme.colors.surfaceAlt,
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
});

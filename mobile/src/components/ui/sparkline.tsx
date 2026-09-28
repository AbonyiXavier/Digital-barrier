import { View } from 'react-native';

import { useTheme } from '@/theme';

import { Text } from './text';

export type SparklineProps = {
  data: number[];
  height?: number;
  color?: string;
  /** Labels under each bar, e.g. weekday initials. */
  labels?: string[];
};

/**
 * A tiny bar chart. Deliberately built from Views rather than SVG — at seven
 * bars it is cheaper, and it inherits the theme's corner radii for free.
 */
export function Sparkline({ data, height = 56, color, labels }: SparklineProps) {
  const theme = useTheme();
  const tint = color ?? theme.colors.brand;
  const max = Math.max(...data, 1);

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height }}>
        {data.map((value, index) => (
          <View
            key={index}
            style={{
              flex: 1,
              // A floor of 4% keeps empty days visible as a ghost bar.
              height: `${Math.max(4, (value / max) * 100)}%`,
              backgroundColor: value === 0 ? theme.colors.surfaceAlt : tint,
              opacity: value === 0 ? 1 : 0.45 + (value / max) * 0.55,
              borderRadius: 4,
            }}
          />
        ))}
      </View>

      {labels ? (
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {labels.map((label, index) => (
            <Text key={index} variant="micro" tone="muted" align="center" style={{ flex: 1 }}>
              {label}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

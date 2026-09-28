import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';

import { useTheme } from '@/theme';

export type ProgressRingProps = {
  /** 0–1. */
  progress: number;
  size?: number;
  thickness?: number;
  colors?: readonly [string, string];
  /** Rendered centred inside the ring. */
  children?: ReactNode;
  /** Colour of the unfilled portion. */
  trackColor?: string;
};

/** Circular gauge behind the dashboard shield and the waiting-period countdown. */
export function ProgressRing({
  progress,
  size = 220,
  thickness = 14,
  colors,
  children,
  trackColor,
}: ProgressRingProps) {
  const theme = useTheme();
  const stops = colors ?? theme.colors.shieldGradient;

  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(1, Math.max(0, progress));

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Defs>
          <SvgGradient id="ringGradient" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={stops[0]} />
            <Stop offset="1" stopColor={stops[1]} />
          </SvgGradient>
        </Defs>

        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={trackColor ?? theme.colors.surfaceAlt}
          strokeWidth={thickness}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="url(#ringGradient)"
          strokeWidth={thickness}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference * (1 - clamped)}
          // Start the arc at 12 o'clock rather than 3.
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>

      {children ? <View style={[StyleSheet.absoluteFill, styles.center]}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
});

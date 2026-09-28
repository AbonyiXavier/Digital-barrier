import { Platform, type ViewStyle } from 'react-native';

/**
 * Elevation. Android only honours `elevation`, iOS only the shadow props, so
 * both are set and the platform picks what it understands.
 */
function shadow(y: number, blur: number, opacity: number, elevation: number): ViewStyle {
  return Platform.select<ViewStyle>({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: y },
      shadowRadius: blur,
      shadowOpacity: opacity,
    },
    android: { elevation },
    default: {
      boxShadow: `0px ${y}px ${blur}px rgba(0,0,0,${opacity})`,
    } as ViewStyle,
  })!;
}

export const shadows = {
  none: {} as ViewStyle,
  sm: shadow(2, 6, 0.1, 2),
  md: shadow(6, 16, 0.14, 6),
  lg: shadow(12, 28, 0.2, 12),
} as const;

export type ShadowName = keyof typeof shadows;

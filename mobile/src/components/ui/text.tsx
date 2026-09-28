import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';

import { useTheme, type Theme } from '@/theme';

export type TextVariant =
  | 'hero'
  | 'display'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'body'
  | 'bodyStrong'
  | 'sub'
  | 'caption'
  | 'micro'
  | 'label'
  | 'mono';

export type TextTone = 'default' | 'secondary' | 'muted' | 'brand' | 'shield' | 'warn' | 'danger' | 'onAccent';

export type TextProps = RNTextProps & {
  variant?: TextVariant;
  tone?: TextTone;
  /** Use the rounded face — reserved for big numerals and headline moments. */
  rounded?: boolean;
  align?: TextStyle['textAlign'];
  weight?: TextStyle['fontWeight'];
};

function variantStyle(theme: Theme, variant: TextVariant): TextStyle {
  const { fontSize, lineHeight, fontWeight, tracking, fontFamily } = theme;
  switch (variant) {
    case 'hero':
      return {
        fontSize: fontSize.hero,
        lineHeight: lineHeight.hero,
        fontWeight: fontWeight.bold,
        letterSpacing: tracking.tight,
      };
    case 'display':
      return {
        fontSize: fontSize.display,
        lineHeight: lineHeight.display,
        fontWeight: fontWeight.bold,
        letterSpacing: tracking.tight,
      };
    case 'h1':
      return {
        fontSize: fontSize.h1,
        lineHeight: lineHeight.h1,
        fontWeight: fontWeight.bold,
        letterSpacing: tracking.snug,
      };
    case 'h2':
      return {
        fontSize: fontSize.h2,
        lineHeight: lineHeight.h2,
        fontWeight: fontWeight.semibold,
        letterSpacing: tracking.snug,
      };
    case 'h3':
      return {
        fontSize: fontSize.h3,
        lineHeight: lineHeight.h3,
        fontWeight: fontWeight.semibold,
      };
    case 'bodyStrong':
      return {
        fontSize: fontSize.body,
        lineHeight: lineHeight.body,
        fontWeight: fontWeight.semibold,
      };
    case 'sub':
      return { fontSize: fontSize.sub, lineHeight: lineHeight.sub, fontWeight: fontWeight.regular };
    case 'caption':
      return {
        fontSize: fontSize.caption,
        lineHeight: lineHeight.caption,
        fontWeight: fontWeight.medium,
      };
    case 'micro':
      return {
        fontSize: fontSize.micro,
        lineHeight: lineHeight.micro,
        fontWeight: fontWeight.medium,
      };
    case 'label':
      return {
        fontSize: fontSize.micro,
        lineHeight: lineHeight.micro,
        fontWeight: fontWeight.semibold,
        letterSpacing: tracking.caps,
        textTransform: 'uppercase',
      };
    case 'mono':
      return {
        fontSize: fontSize.sub,
        lineHeight: lineHeight.sub,
        fontFamily: fontFamily.mono,
      };
    case 'body':
    default:
      return { fontSize: fontSize.body, lineHeight: lineHeight.body, fontWeight: fontWeight.regular };
  }
}

function toneColor(theme: Theme, tone: TextTone): string {
  switch (tone) {
    case 'secondary':
      return theme.colors.textSecondary;
    case 'muted':
      return theme.colors.textMuted;
    case 'brand':
      return theme.colors.brand;
    case 'shield':
      return theme.colors.shield;
    case 'warn':
      return theme.colors.warn;
    case 'danger':
      return theme.colors.danger;
    case 'onAccent':
      return theme.colors.textOnAccent;
    case 'default':
    default:
      return theme.colors.text;
  }
}

export function Text({
  variant = 'body',
  tone = 'default',
  rounded = false,
  align,
  weight,
  style,
  ...rest
}: TextProps) {
  const theme = useTheme();
  return (
    <RNText
      {...rest}
      style={[
        { fontFamily: rounded ? theme.fontFamily.rounded : theme.fontFamily.sans },
        variantStyle(theme, variant),
        { color: toneColor(theme, tone) },
        align ? { textAlign: align } : null,
        weight ? { fontWeight: weight } : null,
        style,
      ]}
    />
  );
}

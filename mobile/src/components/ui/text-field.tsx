import { useState } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { useTheme } from '@/theme';

import { Icon, type IconName } from './icon';
import { Text } from './text';

export type TextFieldProps = TextInputProps & {
  label?: string;
  /** Helper text under the field; replaced by `error` when one is set. */
  hint?: string;
  error?: string;
  icon?: IconName;
};

export function TextField({ label, hint, error, icon, style, ...rest }: TextFieldProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);

  const borderColor = error
    ? theme.colors.danger
    : focused
      ? theme.colors.brand
      : theme.colors.border;

  return (
    <View style={{ gap: theme.spacing.sm }}>
      {label ? (
        <Text variant="caption" tone="secondary">
          {label}
        </Text>
      ) : null}

      <View
        style={[
          styles.field,
          {
            backgroundColor: theme.colors.surface,
            borderColor,
            borderRadius: theme.radius.md,
            paddingHorizontal: theme.spacing.base,
            gap: theme.spacing.md,
          },
        ]}>
        {icon ? <Icon name={icon} size={18} color={theme.colors.textMuted} /> : null}
        <TextInput
          {...rest}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          placeholderTextColor={theme.colors.textMuted}
          style={[
            styles.input,
            {
              color: theme.colors.text,
              fontSize: theme.fontSize.body,
              fontFamily: theme.fontFamily.sans,
            },
            style,
          ]}
        />
      </View>

      {error || hint ? (
        <Text variant="caption" tone={error ? 'danger' : 'muted'}>
          {error ?? hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, minHeight: 52 },
  input: { flex: 1, paddingVertical: 14 },
});

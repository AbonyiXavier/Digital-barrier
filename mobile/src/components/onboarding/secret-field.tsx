import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, TextField, type TextFieldProps } from '@/components/ui';
import { useTheme } from '@/theme';

export type SecretFieldProps = Omit<TextFieldProps, 'secureTextEntry'>;

/**
 * A password field with a show/hide eye. The toggle is positioned over the
 * field rather than inside it so `TextField` keeps owning label, hint and error.
 */
export function SecretField({ label, ...rest }: SecretFieldProps) {
  const theme = useTheme();
  const [visible, setVisible] = useState(false);

  // The field row sits under the label, which is one caption line plus the gap.
  const fieldTop = label ? theme.lineHeight.caption + theme.spacing.sm : 0;

  return (
    <View>
      <TextField
        {...rest}
        label={label}
        secureTextEntry={!visible}
        style={{ paddingRight: theme.spacing.xl }}
      />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={visible ? 'Hide password' : 'Show password'}
        hitSlop={12}
        onPress={() => setVisible((current) => !current)}
        style={({ pressed }) => [
          styles.toggle,
          { top: fieldTop, right: theme.spacing.base, opacity: pressed ? 0.6 : 1 },
        ]}>
        <Icon
          name={visible ? 'eye-off-outline' : 'eye-outline'}
          size={18}
          color={theme.colors.textMuted}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  // 52 matches the field's minimum height, so the eye stays vertically centred.
  toggle: { position: 'absolute', height: 52, width: 24, alignItems: 'center', justifyContent: 'center' },
});

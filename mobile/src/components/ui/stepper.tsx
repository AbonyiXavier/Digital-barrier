import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

export type StepperProps = {
  /** 1-based. */
  current: number;
  total: number;
};

/** Onboarding progress: a filled pill for the current step, dots either side. */
export function Stepper({ current, total }: StepperProps) {
  const theme = useTheme();

  return (
    <View style={[styles.row, { gap: 6 }]}>
      {Array.from({ length: total }, (_, index) => {
        const step = index + 1;
        const done = step < current;
        const active = step === current;
        return (
          <View
            key={step}
            style={{
              height: 5,
              width: active ? 26 : 5,
              borderRadius: 3,
              backgroundColor: done
                ? theme.colors.brandStrong
                : active
                  ? theme.colors.brand
                  : theme.colors.surfaceAlt,
            }}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
});

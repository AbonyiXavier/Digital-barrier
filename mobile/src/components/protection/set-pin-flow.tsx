import { useState } from 'react';
import { View } from 'react-native';

import { Button, Text } from '@/components/ui';
import { useTheme } from '@/theme';

import { PinPad } from './pin-pad';

export type SetPinFlowProps = {
  /** Called once the same PIN has been entered twice. */
  onDone: (pin: string) => void;
  onCancel: () => void;
  length?: number;
};

/** Enter → confirm. A mismatch shakes and sends them back to the first step. */
export function SetPinFlow({ onDone, onCancel, length = 4 }: SetPinFlowProps) {
  const theme = useTheme();
  const [first, setFirst] = useState<string | null>(null);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleChange = (next: string) => {
    if (error) setError(null);

    if (next.length < length) {
      setValue(next);
      return;
    }

    if (first === null) {
      setFirst(next);
      setValue('');
      return;
    }

    if (next === first) {
      setFirst(null);
      setValue('');
      onDone(next);
      return;
    }

    setError('Those two didn’t match. Let’s try again.');
    setFirst(null);
    setValue('');
  };

  const confirming = first !== null;

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <View style={{ gap: theme.spacing.xs }}>
        <Text variant="h3" align="center">
          {confirming ? 'Enter it once more' : `Choose a ${length}-digit PIN`}
        </Text>
        <Text variant="sub" tone={error ? 'danger' : 'secondary'} align="center">
          {error ??
            (confirming
              ? 'Confirming it now means you won’t be locked out later.'
              : 'Pick something you’ll remember on a hard day, not something obvious.')}
        </Text>
      </View>

      <PinPad value={value} length={length} error={error !== null} onChange={handleChange} />

      <Button label="Cancel" variant="ghost" onPress={onCancel} />
    </View>
  );
}

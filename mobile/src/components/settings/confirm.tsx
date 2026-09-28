import { useEffect, useState } from 'react';

import {
  Button,
  ListRow,
  type ButtonSize,
  type ButtonVariant,
  type IconName,
} from '@/components/ui';

const ARM_DURATION = 4000;

/** Arms on the first tap and disarms itself, so nothing destructive needs an alert. */
function useArmed(): [boolean, (next: boolean) => void] {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), ARM_DURATION);
    return () => clearTimeout(timer);
  }, [armed]);

  return [armed, setArmed];
}

export type ConfirmButtonProps = {
  label: string;
  confirmLabel?: string;
  onConfirm: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
};

export function ConfirmButton({
  label,
  confirmLabel = 'Tap again to confirm',
  onConfirm,
  variant = 'danger',
  size = 'base',
  icon,
}: ConfirmButtonProps) {
  const [armed, setArmed] = useArmed();

  return (
    <Button
      label={armed ? confirmLabel : label}
      variant={variant}
      size={size}
      icon={armed ? 'alert-circle-outline' : icon}
      onPress={() => {
        if (!armed) {
          setArmed(true);
          return;
        }
        setArmed(false);
        onConfirm();
      }}
    />
  );
}

export type ConfirmRowProps = {
  title: string;
  confirmTitle?: string;
  subtitle?: string;
  confirmSubtitle?: string;
  icon: IconName;
  iconColor?: string;
  onConfirm: () => void;
  divider?: boolean;
};

export function ConfirmRow({
  title,
  confirmTitle = 'Tap again to confirm',
  subtitle,
  confirmSubtitle = 'Or wait a moment and this goes back to normal',
  icon,
  iconColor,
  onConfirm,
  divider = false,
}: ConfirmRowProps) {
  const [armed, setArmed] = useArmed();

  return (
    <ListRow
      title={armed ? confirmTitle : title}
      subtitle={armed ? confirmSubtitle : subtitle}
      icon={armed ? 'alert-circle-outline' : icon}
      iconColor={iconColor}
      chevron={false}
      divider={divider}
      onPress={() => {
        if (!armed) {
          setArmed(true);
          return;
        }
        setArmed(false);
        onConfirm();
      }}
    />
  );
}

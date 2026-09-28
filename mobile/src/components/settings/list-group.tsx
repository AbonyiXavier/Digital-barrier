import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { View } from 'react-native';

import { Card } from '@/components/ui';
import { useTheme } from '@/theme';

/**
 * An inset iOS-style group: rows sit in a single card and every row but the
 * last gets a hairline. Doing it here means no screen can forget the last-row
 * rule or space its rows differently from the group next to it.
 */
export function ListGroup({ children }: { children: ReactNode }) {
  const theme = useTheme();

  const rows = Children.toArray(children).filter(isValidElement) as ReactElement<{
    divider?: boolean;
  }>[];

  return (
    <Card padding="none">
      {rows.map((row, index) => (
        <View key={row.key ?? index} style={{ paddingHorizontal: theme.spacing.base }}>
          {cloneElement(row, { divider: index < rows.length - 1 })}
        </View>
      ))}
    </Card>
  );
}

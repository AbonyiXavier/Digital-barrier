import { useMemo } from 'react';
import { StyleSheet } from 'react-native';

import { useTheme, type Theme } from './index';

type NamedStyles = StyleSheet.NamedStyles<Record<string, unknown>>;

/**
 * Build a themed stylesheet once per scheme change.
 *
 *   const styles = useStyles((t) => ({ card: { backgroundColor: t.colors.surface } }));
 *
 * `factory` must be defined at module scope (it is memoised on the theme only),
 * which is also what keeps screens from rebuilding styles on every render.
 */
export function useStyles<T extends NamedStyles>(factory: (theme: Theme) => T): T {
  const theme = useTheme();
  return useMemo(() => StyleSheet.create(factory(theme)), [theme, factory]);
}

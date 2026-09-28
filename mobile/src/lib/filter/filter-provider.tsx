/**
 * One enforcement loop for the whole app.
 *
 * The hook polls and reconciles, so mounting it in two places would give two
 * loops racing a start against a stop. A context keeps it single and lets any
 * screen read the result.
 */
import { createContext, useContext, type ReactNode } from 'react';

import { useProtectionEnforcement, type EnforcementState } from './enforcement';

interface FilterContextValue {
  state: EnforcementState;
  requestConsent: () => Promise<void>;
  retry: () => void;
}

const FilterContext = createContext<FilterContextValue | null>(null);

export function FilterProvider({ children }: { children: ReactNode }) {
  const value = useProtectionEnforcement();
  return <FilterContext.Provider value={value}>{children}</FilterContext.Provider>;
}

export function useFilter(): FilterContextValue {
  const value = useContext(FilterContext);
  if (!value) throw new Error('useFilter must be used inside <FilterProvider>');
  return value;
}

import { Redirect } from 'expo-router';

import { useAppState } from '@/store/app-store';

/** Entry gate: straight to the dashboard for a returning user, else onboarding. */
export default function Index() {
  const { onboarded } = useAppState();
  return <Redirect href={onboarded ? '/(tabs)' : '/(onboarding)/welcome'} />;
}

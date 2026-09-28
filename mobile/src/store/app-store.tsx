import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { requestFor, type SyncResult } from '@/lib/api/actions';
import { fetchBootstrap } from '@/lib/api/bootstrap';
import { ApiError, NetworkError } from '@/lib/api/client';
import { getInstallId } from '@/lib/api/install-id';
import { reconcile } from './reconcile';

import {
  PROTECTION_CATEGORIES,
  seedApprovalSettings,
  seedBlockedScreen,
  seedBlocklist,
  seedDevices,
  seedLock,
  seedNotifications,
  seedPartners,
  seedSubscription,
  seedWeeklyBlocks,
} from '@/data/seed';
import {
  PROTECTION_LEVELS,
  type ApprovalSettings,
  type Blocklist,
  type BlockedScreenConfig,
  type Device,
  type DisableRequest,
  type NotificationSettings,
  type Partner,
  type PlanId,
  type ProtectionCategoryId,
  type ProtectionLevelId,
  type ProtectionLock,
  type Subscription,
  type User,
  type WaitingPeriodMinutes,
} from '@/types';

const STORAGE_KEY = 'aegis.state.v1';

export type AppState = {
  hydrated: boolean;
  onboarded: boolean;
  user: User | null;
  protectionOn: boolean;
  lock: ProtectionLock;
  enabledCategories: ProtectionCategoryId[];
  devices: Device[];
  partners: Partner[];
  accountabilityOn: boolean;
  approvalSettings: ApprovalSettings;
  requests: DisableRequest[];
  subscription: Subscription;
  blocklist: Blocklist;
  blockedScreen: BlockedScreenConfig;
  notifications: NotificationSettings;
  weeklyBlocks: number[];
  /** Blocked attempts today, shown on the dashboard. */
  blocksToday: number;
};

const initialState: AppState = {
  hydrated: false,
  onboarded: false,
  user: null,
  protectionOn: true,
  lock: seedLock,
  enabledCategories: ['adult-websites', 'adult-apps'],
  devices: seedDevices,
  partners: seedPartners,
  accountabilityOn: true,
  approvalSettings: seedApprovalSettings,
  requests: [],
  subscription: seedSubscription,
  blocklist: seedBlocklist,
  blockedScreen: seedBlockedScreen,
  notifications: seedNotifications,
  weeklyBlocks: seedWeeklyBlocks,
  blocksToday: 19,
};

/** The slice of state we persist. Derived and transient fields stay out. */
type PersistedState = Omit<AppState, 'hydrated'>;

type Action =
  | { type: 'hydrate'; payload: Partial<PersistedState> | null }
  | { type: 'complete-onboarding'; user: User; categories: ProtectionCategoryId[] }
  | { type: 'reset' }
  | { type: 'set-protection'; on: boolean }
  | { type: 'set-level'; level: ProtectionLevelId }
  | { type: 'set-pin'; pin: string }
  | { type: 'set-waiting-period'; minutes: WaitingPeriodMinutes }
  | { type: 'set-lock-partner'; partnerId: string | null }
  | { type: 'toggle-category'; id: ProtectionCategoryId }
  | { type: 'set-accountability'; on: boolean }
  | { type: 'add-partner'; partner: Partner }
  | { type: 'remove-partner'; id: string }
  | { type: 'set-partner-status'; id: string; status: Partner['status'] }
  | { type: 'patch-approval-settings'; patch: Partial<ApprovalSettings> }
  | { type: 'add-request'; request: DisableRequest }
  | { type: 'resolve-request'; id: string; status: DisableRequest['status'] }
  | { type: 'add-device'; device: Device }
  | { type: 'remove-device'; id: string }
  | { type: 'set-device-status'; id: string; status: Device['status'] }
  | { type: 'set-plan'; plan: PlanId; period: Subscription['period'] }
  | { type: 'patch-blocklist'; patch: Partial<Blocklist> }
  | { type: 'allow-domain'; domain: string }
  | { type: 'block-domain'; domain: string }
  | { type: 'remove-rule'; list: 'allowed' | 'blocked'; domain: string }
  | { type: 'patch-blocked-screen'; patch: Partial<BlockedScreenConfig> }
  | { type: 'patch-notifications'; patch: Partial<NotificationSettings> }
  | { type: 'patch-user'; patch: Partial<User> }
  /** Internal: replace an optimistic row with the one the server stored. */
  | { type: 'sync-reconcile'; result: SyncResult };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'hydrate':
      return { ...state, ...(action.payload ?? {}), hydrated: true };

    case 'sync-reconcile':
      return reconcile(state, action.result);

    case 'complete-onboarding':
      return {
        ...state,
        onboarded: true,
        user: action.user,
        enabledCategories: action.categories,
        protectionOn: true,
      };

    case 'reset':
      return { ...initialState, hydrated: true, onboarded: false, user: null };

    case 'set-protection':
      return { ...state, protectionOn: action.on };

    case 'set-level':
      return { ...state, lock: { ...state.lock, level: action.level } };

    case 'set-pin':
      return { ...state, lock: { ...state.lock, pin: action.pin } };

    case 'set-waiting-period':
      return { ...state, lock: { ...state.lock, waitingPeriodMinutes: action.minutes } };

    case 'set-lock-partner':
      return { ...state, lock: { ...state.lock, partnerId: action.partnerId } };

    case 'toggle-category': {
      const on = state.enabledCategories.includes(action.id);
      return {
        ...state,
        enabledCategories: on
          ? state.enabledCategories.filter((c) => c !== action.id)
          : [...state.enabledCategories, action.id],
      };
    }

    case 'set-accountability':
      return {
        ...state,
        accountabilityOn: action.on,
        // Turning accountability off must not leave a level-4 lock pointing at
        // a partner who is no longer involved.
        lock: action.on ? state.lock : { ...state.lock, partnerId: null },
      };

    case 'add-partner':
      return { ...state, partners: [...state.partners, action.partner] };

    case 'remove-partner':
      return {
        ...state,
        partners: state.partners.filter((p) => p.id !== action.id),
        lock:
          state.lock.partnerId === action.id ? { ...state.lock, partnerId: null } : state.lock,
      };

    case 'set-partner-status':
      return {
        ...state,
        partners: state.partners.map((p) =>
          p.id === action.id ? { ...p, status: action.status } : p,
        ),
      };

    case 'patch-approval-settings':
      return { ...state, approvalSettings: { ...state.approvalSettings, ...action.patch } };

    case 'add-request':
      return { ...state, requests: [action.request, ...state.requests] };

    case 'resolve-request': {
      const request = state.requests.find((r) => r.id === action.id);
      const approved = action.status === 'approved';

      return {
        ...state,
        requests: state.requests.map((r) =>
          r.id === action.id ? { ...r, status: action.status } : r,
        ),
        // Clearing the lock is the only thing that can drop protection at
        // levels 3 and 4 — but a request raised only to weaken the lock must
        // leave protection exactly where it was.
        protectionOn:
          approved && request?.intent === 'disable' ? false : state.protectionOn,
        lock:
          approved && request?.intent === 'lower-level' && request.targetLevel
            ? { ...state.lock, level: request.targetLevel }
            : state.lock,
      };
    }

    case 'add-device':
      return { ...state, devices: [...state.devices, action.device] };

    case 'remove-device':
      return { ...state, devices: state.devices.filter((d) => d.id !== action.id) };

    case 'set-device-status':
      return {
        ...state,
        devices: state.devices.map((d) =>
          d.id === action.id ? { ...d, status: action.status } : d,
        ),
      };

    case 'set-plan':
      return {
        ...state,
        subscription: {
          plan: action.plan,
          period: action.period,
          renewsAt:
            action.plan === 'premium'
              ? new Date(
                  Date.now() + (action.period === 'yearly' ? 365 : 30) * 86_400_000,
                ).toISOString()
              : null,
        },
      };

    case 'patch-blocklist':
      return { ...state, blocklist: { ...state.blocklist, ...action.patch } };

    case 'allow-domain':
      return {
        ...state,
        blocklist: {
          ...state.blocklist,
          allowed: [...new Set([...state.blocklist.allowed, action.domain])],
        },
      };

    case 'block-domain':
      return {
        ...state,
        blocklist: {
          ...state.blocklist,
          blocked: [...new Set([...state.blocklist.blocked, action.domain])],
        },
      };

    case 'remove-rule':
      return {
        ...state,
        blocklist: {
          ...state.blocklist,
          [action.list]: state.blocklist[action.list].filter((d) => d !== action.domain),
        },
      };

    case 'patch-blocked-screen':
      return { ...state, blockedScreen: { ...state.blockedScreen, ...action.patch } };

    case 'patch-notifications':
      return { ...state, notifications: { ...state.notifications, ...action.patch } };

    case 'patch-user':
      return { ...state, user: state.user ? { ...state.user, ...action.patch } : state.user };

    default:
      return state;
  }
}

type AppStore = {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  /** Re-reads everything from the server. */
  refresh: () => Promise<void>;
  /** The last write that failed, for a screen to surface. Null when clear. */
  syncError: string | null;
  clearSyncError: () => void;
};

const AppStoreContext = createContext<AppStore | null>(null);

function describe(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof NetworkError) return 'No connection. That change was not saved.';
  return 'Something went wrong. That change was not saved.';
}

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [state, baseDispatch] = useReducer(reducer, initialState);
  const [syncError, setSyncError] = useState<string | null>(null);

  // A snapshot of the latest state for `dispatch` to read. Kept in a ref because
  // `dispatch` must stay a stable, synchronous function: every screen calls it
  // and immediately navigates away, and making it async would mean rewriting
  // all of them.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const installIdRef = useRef<string>('');

  const refresh = useCallback(async () => {
    const fresh = await fetchBootstrap(installIdRef.current);
    baseDispatch({ type: 'hydrate', payload: fresh });
  }, []);

  /**
   * Hydration, in two steps.
   *
   * The cache paints the UI immediately so the app does not open on a spinner,
   * then the server's answer replaces it. The cache is a convenience, never the
   * truth: anything the lock depends on — the level, the countdown, whether a
   * request is pending — comes from the API, because state a determined user can
   * edit on their own device is exactly what this product must not trust.
   */
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      installIdRef.current = await getInstallId();

      let painted = false;
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw !== null && !cancelled) {
          baseDispatch({ type: 'hydrate', payload: JSON.parse(raw) as Partial<PersistedState> });
          painted = true;
        }
      } catch {
        // A corrupt cache is not worth reporting; the server is about to answer.
      }

      try {
        const fresh = await fetchBootstrap(installIdRef.current);
        if (!cancelled) baseDispatch({ type: 'hydrate', payload: fresh });
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 401) {
          // Not signed in. A cached session would otherwise show someone else's
          // dashboard to whoever picks up the phone next.
          await AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
          baseDispatch({
            type: 'hydrate',
            payload: { onboarded: false, user: null } as Partial<PersistedState>,
          });
          return;
        }
        // Offline with a cache: carry on with it. Offline without one: let the
        // app start at onboarding rather than hang.
        if (!painted) baseDispatch({ type: 'hydrate', payload: null });
        setSyncError(describe(error));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Apply locally, then tell the server.
   *
   * On failure the server is re-read rather than a local snapshot restored: the
   * snapshot could itself be stale, and the server is the only authority on the
   * lock. The screen has usually navigated on by then, so the correction lands
   * quietly and `syncError` is what the user actually sees.
   */
  const dispatch = useCallback<React.Dispatch<Action>>((action) => {
    const before = stateRef.current;
    baseDispatch(action);

    const call = requestFor(action, before);
    if (call === null) return;

    void call(installIdRef.current).then(
      (result) => {
        if (result) baseDispatch({ type: 'sync-reconcile', result });
      },
      (error: unknown) => {
        setSyncError(describe(error));
        void refresh().catch(() => {
          // Already offline and already reported; nothing further to do.
        });
      },
    );
  }, [refresh]);

  // Cache for the next cold start. Never the source of truth — see hydration.
  useEffect(() => {
    if (!state.hydrated) return;
    const { hydrated: _hydrated, ...persisted } = state;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(persisted)).catch(() => {});
  }, [state]);

  const clearSyncError = useCallback(() => setSyncError(null), []);

  const value = useMemo(
    () => ({ state, dispatch, refresh, syncError, clearSyncError }),
    [state, dispatch, refresh, syncError, clearSyncError],
  );

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
}

export function useAppStore(): AppStore {
  const store = useContext(AppStoreContext);
  if (!store) throw new Error('useAppStore must be used inside <AppStoreProvider>');
  return store;
}

/** Read-only slice access, so screens don't all destructure `state`. */
export function useAppState(): AppState {
  return useAppStore().state;
}

export function useAppDispatch(): React.Dispatch<Action> {
  return useAppStore().dispatch;
}

// ---------------------------------------------------------------------------
// Derived selectors
// ---------------------------------------------------------------------------

export function useProtectionLevel() {
  const { lock } = useAppState();
  return PROTECTION_LEVELS.find((l) => l.id === lock.level) ?? PROTECTION_LEVELS[0];
}

export function useActivePartner(): Partner | null {
  const { partners, lock } = useAppState();
  return partners.find((p) => p.id === lock.partnerId) ?? null;
}

export function usePendingRequest(): DisableRequest | null {
  const { requests } = useAppState();
  return requests.find((r) => r.status === 'pending') ?? null;
}

export function useIsPremium(): boolean {
  return useAppState().subscription.plan === 'premium';
}

/**
 * Whole days since protection was first switched on.
 *
 * The clock is read into state rather than during render: a render must be
 * pure, and the figure still needs to roll over while the app sits open.
 */
export function useProtectedDays(): number {
  const { user } = useAppState();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  if (!user) return 0;
  const ms = now - new Date(user.protectedSince).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

export function useProtectedDevices(): Device[] {
  return useAppState().devices.filter((d) => d.status === 'protected');
}

export { PROTECTION_CATEGORIES };
export type { Action as AppAction };

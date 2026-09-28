import type {
  ApprovalSettings,
  Blocklist,
  BlockedScreenConfig,
  Device,
  NotificationSettings,
  Partner,
  Plan,
  ProtectionCategory,
  ProtectionLock,
  Subscription,
  User,
} from '@/types';

/** Minutes/hours/days ago as an ISO string — keeps the seed readable. */
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const minutes = (n: number) => n * 60_000;
const hours = (n: number) => minutes(n * 60);
const days = (n: number) => hours(n * 24);

export const PROTECTION_CATEGORIES: readonly ProtectionCategory[] = [
  {
    id: 'adult-websites',
    title: 'Adult websites',
    description: 'Blocks adult sites at the DNS level, in every browser on the device.',
    icon: 'globe',
    premium: false,
  },
  {
    id: 'adult-apps',
    title: 'Adult apps',
    description: 'Stops known adult apps from loading their content or signing in.',
    icon: 'apps',
    premium: false,
  },
  {
    id: 'adult-search',
    title: 'Safe search',
    description: 'Forces safe search on Google, Bing, DuckDuckGo and YouTube.',
    icon: 'search',
    premium: true,
  },
  {
    id: 'gambling',
    title: 'Gambling',
    description: 'Blocks betting and casino sites. Useful alongside adult content.',
    icon: 'dice',
    premium: true,
  },
] as const;

export const PLANS: readonly Plan[] = [
  {
    id: 'free',
    name: 'Free',
    tagline: 'The core barrier, on one device',
    priceMonthly: 0,
    priceYearly: 0,
    features: [
      { label: 'Adult website + app blocking', included: true },
      { label: '1 device', included: true },
      { label: 'PIN lock', included: true },
      { label: 'Waiting period lock', included: false },
      { label: 'Accountability partner', included: false },
      { label: 'Safe search + gambling filters', included: false },
      { label: 'Custom blocked screen', included: false },
    ],
  },
  {
    id: 'premium',
    name: 'Premium',
    tagline: 'Every lock, every device, a person beside you',
    priceMonthly: 4.99,
    priceYearly: 39.99,
    features: [
      { label: 'Adult website + app blocking', included: true },
      { label: 'Unlimited devices', included: true },
      { label: 'PIN lock', included: true },
      { label: 'Waiting period lock', included: true },
      { label: 'Accountability partner', included: true },
      { label: 'Safe search + gambling filters', included: true },
      { label: 'Custom blocked screen', included: true },
    ],
  },
] as const;

export const seedUser: User = {
  id: 'u_1',
  name: 'Francis Abonyi',
  email: 'francis@example.com',
  initials: 'FA',
  protectedSince: ago(days(2)),
};

export const seedLock: ProtectionLock = {
  level: 3,
  pin: '2468',
  waitingPeriodMinutes: 2880,
  partnerId: null,
};

export const seedDevices: Device[] = [
  {
    id: 'd_iphone',
    name: 'Francis’ iPhone',
    platform: 'ios',
    status: 'protected',
    lastSeen: ago(minutes(1)),
    isCurrent: true,
    weeklyBlocks: [4, 9, 2, 14, 6, 3, 11],
  },
  {
    id: 'd_macbook',
    name: 'MacBook Pro',
    platform: 'macos',
    status: 'protected',
    lastSeen: ago(minutes(22)),
    isCurrent: false,
    weeklyBlocks: [12, 7, 18, 5, 9, 2, 8],
  },
  {
    id: 'd_pixel',
    name: 'Pixel 8',
    platform: 'android',
    status: 'offline',
    lastSeen: ago(days(3)),
    isCurrent: false,
    weeklyBlocks: [0, 1, 0, 3, 0, 0, 0],
  },
  {
    id: 'd_pc',
    name: 'Study PC',
    platform: 'windows',
    status: 'needs-setup',
    lastSeen: ago(days(6)),
    isCurrent: false,
    weeklyBlocks: [0, 0, 0, 0, 0, 0, 0],
  },
];

export const seedPartners: Partner[] = [
  {
    id: 'p_amara',
    name: 'Amara Abonyi',
    relationship: 'Wife',
    email: 'amara@example.com',
    status: 'active',
    invitedAt: ago(days(12)),
    initials: 'AA',
  },
  {
    id: 'p_tobe',
    name: 'Tobe Nwosu',
    relationship: 'Mentor',
    email: 'tobe@example.com',
    status: 'pending',
    invitedAt: ago(hours(20)),
    initials: 'TN',
  },
];

export const seedApprovalSettings: ApprovalSettings = {
  notifyOnDisable: true,
  notifyOnLevelChange: true,
  weeklyDigest: false,
  shareActivityDetail: false,
};

export const seedSubscription: Subscription = {
  plan: 'free',
  period: 'monthly',
  renewsAt: null,
};

export const seedBlocklist: Blocklist = {
  sources: [
    { id: 'hagezi-nsfw', name: 'HaGeZi NSFW', domains: 74152, updatedAt: ago(hours(3)) },
    { id: 'stevenblack-porn', name: 'StevenBlack porn', domains: 41207, updatedAt: ago(hours(3)) },
    { id: 'community', name: 'Community reports', domains: 1832, updatedAt: ago(days(1)) },
  ],
  lastCheckedAt: ago(hours(3)),
  autoUpdate: true,
  allowed: ['medicalnewstoday.com'],
  blocked: ['example-adult-site.com'],
};

export const seedBlockedScreen: BlockedScreenConfig = {
  theme: 'calm',
  headline: 'Not this time.',
  message: 'You set this barrier up on a clearer day. That version of you is still right.',
  showPartnerButton: true,
  showBreathingExercise: true,
};

export const seedNotifications: NotificationSettings = {
  blockedAttempts: true,
  partnerActivity: true,
  weeklyReport: true,
  productUpdates: false,
};

/** Blocks in the last 7 days across every device, for the dashboard chart. */
export const seedWeeklyBlocks = [16, 17, 20, 22, 15, 5, 19];

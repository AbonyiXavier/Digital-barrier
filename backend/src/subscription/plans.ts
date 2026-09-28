/**
 * The plan comparison table, verbatim from the app.
 *
 * Copy lives on the server because the paywall must not disagree with what the
 * subscription endpoint thinks the plans are — a client-side table drifts the
 * moment one of the two ships without the other.
 *
 * Both plans carry the same seven feature labels in the same order, so the two
 * columns line up row for row in the UI. Two of the labels differ in text as
 * well as in `included` ("1 device" / "Unlimited devices"), which is why this is
 * a pair of full lists rather than one list with a flag.
 */

export interface PlanFeature {
  label: string;
  included: boolean;
}

export interface Plan {
  id: 'free' | 'premium';
  name: string;
  tagline: string;
  priceMonthly: number;
  priceYearly: number;
  features: PlanFeature[];
}

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

/** Days in a billing period. No proration: there is no real billing here. */
export const PERIOD_DAYS = { monthly: 30, yearly: 365 } as const;

import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma';
import { toPeriod, toPeriodId, toPlan, toPlanId, isoOrNull } from '../users/api-mappers';
import { PERIOD_DAYS, PLANS, type Plan } from './plans';
import type { UpdateSubscriptionDto } from './dto/update-subscription.dto';

const MS_PER_DAY = 86_400_000;

export interface SubscriptionState {
  plan: 'free' | 'premium';
  period: 'monthly' | 'yearly';
  /** ISO 8601 UTC, null on the free plan. */
  renewsAt: string | null;
}

export interface SubscriptionResponse extends SubscriptionState {
  /** The comparison table the paywall renders. */
  plans: readonly Plan[];
}

@Injectable()
export class SubscriptionService {
  constructor(private readonly prisma: PrismaService) {}

  async read(userId: string): Promise<SubscriptionResponse> {
    const row = await this.prisma.subscription.findUnique({ where: { userId } });
    return {
      plan: row ? toPlanId(row.plan) : 'free',
      period: row ? toPeriodId(row.period) : 'monthly',
      renewsAt: isoOrNull(row?.renewsAt),
      plans: PLANS,
    };
  }

  /**
   * Changes the plan.
   *
   * There is no billing here. This endpoint stands in for a completed App Store
   * or Play purchase: in production the store's server-to-server receipt
   * notification is the only thing that may promote an account, and this handler
   * would become the code that validates that receipt. Nothing about the shape
   * of the request would change, which is why it is worth writing now.
   *
   * `renewsAt` is computed server-side — `now + 365 days` for a yearly plan,
   * `now + 30` otherwise — and is null on free, because the database constrains
   * PREMIUM to a non-null renewal and FREE to a null one.
   *
   * **Downgrading deletes nothing.** Not the PIN hash, not the lock level, not
   * the blocklist rules, not `protectionOn`. The app states this twice — "Your
   * blocklist, your PIN and your rules stay exactly as they are. Nothing is
   * deleted, and protection is never switched off on your behalf" — and it is a
   * promise about the moment a user is most likely to feel punished. A free
   * account holding premium-only configuration (a level-4 lock, a custom
   * blocked screen) is therefore a legal state that the paywall re-gates on
   * write; there is deliberately no cleanup pass here.
   */
  async update(userId: string, body: UpdateSubscriptionDto): Promise<SubscriptionResponse> {
    const plan = toPlan(body.plan);
    const period = toPeriod(body.period);
    const renewsAt =
      plan === 'PREMIUM'
        ? new Date(Date.now() + PERIOD_DAYS[body.period] * MS_PER_DAY)
        : null;

    const row = await this.prisma.subscription.upsert({
      where: { userId },
      create: { userId, plan, period, renewsAt },
      update: { plan, period, renewsAt },
    });

    return {
      plan: toPlanId(row.plan),
      period: toPeriodId(row.period),
      renewsAt: isoOrNull(row.renewsAt),
      plans: PLANS,
    };
  }

  /** Whether premium-only configuration may be written. Used by settings. */
  async isPremium(userId: string): Promise<boolean> {
    const row = await this.prisma.subscription.findUnique({
      where: { userId },
      select: { plan: true },
    });
    return row?.plan === 'PREMIUM';
  }
}

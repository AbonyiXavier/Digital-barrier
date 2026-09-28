/**
 * The blocklist as the app sees it, and the policy engine behind it.
 *
 * Policy order is the prototype's, preserved deliberately:
 *
 *   allowlist  >  blocklist  >  safesearch  >  upstream
 *
 * The allowlist wins unconditionally over the blocklist (see `decide` in
 * `matching.ts`). Safe search is consulted only after a name has survived the
 * block check, because an outright block must always beat a redirect; and it is
 * consulted even for a name the allowlist let through, which is the prototype's
 * behaviour: allowing `google.com` means "do not sinkhole it", not "hand me
 * unfiltered results".
 */

import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  NotImplementedException,
} from '@nestjs/common';

import { FeedsService } from '../feeds/feeds.service';
import type { ProtectionCategory } from '../../generated/prisma/client';
import { PrismaService } from '../prisma';
import { normaliseDomain } from './domain';
import type { CreateRuleDto, RuleListWire } from './dto';
import { type Decision, decide, normalize } from './matching';
import { SAFESEARCH_MAP, safeSearchEntries, target, type SafeSearchEntry } from './safesearch';

export interface BlocklistView {
  sources: { id: string; name: string; domains: number; updatedAt: string }[];
  lastCheckedAt: string;
  autoUpdate: boolean;
  allowed: string[];
  blocked: string[];
}

export type PolicyAction = 'BLOCKED' | 'SAFESEARCH' | 'ALLOWED';

export interface PolicyDecision extends Decision {
  /** The normalised name the decision was made about. */
  domain: string;
  action: PolicyAction;
  /** Set only when the action is SAFESEARCH. */
  safeSearchTarget: string | null;
  /** How many rules were in play, so a surprising answer can be sanity-checked. */
  counts: { userAllowed: number; userBlocked: number; feedDomains: number };
}

/**
 * Auto-update, pending a schema change.
 *
 * There is no column for this on any model, and the schema is frozen, so it is
 * reported as `true` because that is what the system actually does: a cron
 * enqueues a refresh every six hours for every enabled feed, for everybody. A
 * request to turn it off cannot be honoured and is therefore refused rather than
 * accepted and dropped — see `setAutoUpdate`.
 */
const AUTO_UPDATE = true;

/** A 400 carrying the app's own wording for the same input. */
class BadDomainException extends BadRequestException {
  constructor(message: string) {
    super({ code: 'INVALID_DOMAIN', message });
  }
}

@Injectable()
export class BlocklistService {
  private readonly logger = new Logger(BlocklistService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly feeds: FeedsService,
  ) {}

  async overview(userId: string): Promise<BlocklistView> {
    const [sources, lastChecked, rules] = await Promise.all([
      this.feeds.publishedSources(),
      this.feeds.lastCheckedAt(),
      this.prisma.userRule.findMany({
        where: { userId },
        select: { domain: true, list: true },
        orderBy: { domain: 'asc' },
      }),
    ]);

    return {
      sources,
      // Epoch when nothing has ever refreshed: the app's type wants a string, and
      // an honest "never" reads better than a fabricated recent timestamp.
      lastCheckedAt: (lastChecked ?? new Date(0)).toISOString(),
      autoUpdate: AUTO_UPDATE,
      allowed: rules.filter((rule) => rule.list === 'ALLOW').map((rule) => rule.domain),
      blocked: rules.filter((rule) => rule.list === 'BLOCK').map((rule) => rule.domain),
    };
  }

  /**
   * Add or move a rule.
   *
   * `@@unique([userId, domain])` with a `list` discriminator means a domain
   * physically cannot be on both lists, so adding an already-blocked domain to
   * the allowlist is not a conflict to reject — it is the user changing their
   * mind, and an upsert that flips `list` is the only coherent answer.
   */
  async addRule(
    userId: string,
    dto: CreateRuleDto,
  ): Promise<{ domain: string; list: RuleListWire; moved: boolean }> {
    const domain = this.requireDomain(dto.domain);
    const list = dto.list === 'allowed' ? 'ALLOW' : 'BLOCK';

    const existing = await this.prisma.userRule.findUnique({
      where: { userId_domain: { userId, domain } },
      select: { list: true },
    });

    await this.prisma.userRule.upsert({
      where: { userId_domain: { userId, domain } },
      create: { userId, domain, list },
      update: { list },
    });

    return { domain, list: dto.list, moved: existing !== null && existing.list !== list };
  }

  async removeRule(userId: string, rawDomain: string): Promise<void> {
    const domain = this.requireDomain(rawDomain);
    const deleted = await this.prisma.userRule.deleteMany({ where: { userId, domain } });
    if (deleted.count === 0) {
      throw new NotFoundException({
        code: 'RULE_NOT_FOUND',
        message: `${domain} is not on either list.`,
      });
    }
  }

  /**
   * SCHEMA GAP. `autoUpdate` has nowhere to live.
   *
   * The app has a switch for it; no model has a column for it, and the schema is
   * frozen. The interim is to acknowledge `true` (already true) and refuse
   * `false` with 501, because the alternative — returning 200 and forgetting —
   * makes the client show a setting that silently reverts, which is exactly the
   * class of bug this codebase is written to avoid. See the report for the
   * column this needs.
   */
  setAutoUpdate(autoUpdate: boolean): { autoUpdate: boolean } {
    if (!autoUpdate) {
      throw new NotImplementedException({
        code: 'AUTO_UPDATE_NOT_STORABLE',
        message:
          'Automatic feed updates cannot be switched off yet: there is no column to ' +
          'record the preference, and the refresh schedule is server-wide.',
      });
    }
    return { autoUpdate: AUTO_UPDATE };
  }

  safeSearch(): { entries: SafeSearchEntry[]; count: number } {
    const entries = safeSearchEntries();
    return { entries, count: entries.length };
  }

  /**
   * The policy decision for one name, for support and for the e2e tests.
   *
   * Deliberately says nothing about who asked and writes nothing down: this is a
   * verification tool, and turning it into a log of names anyone looked up would
   * be the one thing the schema is built to make impossible.
   */
  async decideFor(userId: string, rawDomain: string): Promise<PolicyDecision> {
    const domain = normalize(rawDomain);
    if (domain === '') {
      throw new NotFoundException({ code: 'DOMAIN_REQUIRED', message: 'Pass a domain.' });
    }

    const [rules, feedDomains] = await Promise.all([
      this.userRules(userId),
      this.feeds.publishedDomains(),
    ]);

    // The user's own blocks sit on top of the feeds; the allowlist overrides both.
    const blocked = new Set<string>(feedDomains);
    for (const rule of rules.blocked) blocked.add(rule);

    const decision = decide({ allowed: rules.allowed, blocked }, domain);
    const counts = {
      userAllowed: rules.allowed.size,
      userBlocked: rules.blocked.size,
      feedDomains: feedDomains.size,
    };

    if (!decision.allowed) {
      return { ...decision, domain, action: 'BLOCKED', safeSearchTarget: null, counts };
    }

    // Safe search comes after the block check and never overrides it.
    const safeHost = target(domain, SAFESEARCH_MAP);
    if (safeHost !== null) {
      return {
        ...decision,
        domain,
        action: 'SAFESEARCH',
        safeSearchTarget: safeHost,
        counts,
      };
    }

    return { ...decision, domain, action: 'ALLOWED', safeSearchTarget: null, counts };
  }

  /** This user's two rule sets, ready for the matcher. */
  /** The categories this account has switched on, for the compiled artifact. */
  async enabledCategoriesOf(userId: string): Promise<ProtectionCategory[]> {
    const protection = await this.prisma.protection.findUnique({
      where: { userId },
      select: { enabledCategories: true },
    });
    return protection?.enabledCategories ?? [];
  }

  private async userRules(userId: string): Promise<{ allowed: Set<string>; blocked: Set<string> }> {
    const rows = await this.prisma.userRule.findMany({
      where: { userId },
      select: { domain: true, list: true },
    });
    const allowed = new Set<string>();
    const blocked = new Set<string>();
    for (const row of rows) {
      (row.list === 'ALLOW' ? allowed : blocked).add(row.domain);
    }
    return { allowed, blocked };
  }

  private requireDomain(raw: string): string {
    const result = normaliseDomain(raw);
    if (!result.ok) {
      // A 400 with the field message the app already shows for the same input.
      throw new BadDomainException(result.error);
    }
    if (result.domain.length > 253) {
      throw new BadDomainException('That is longer than a hostname can be.');
    }
    this.logger.debug(`normalised rule domain to ${result.domain}`);
    return result.domain;
  }
}

import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PartnerStatus, PlanId, type ProtectionCategory } from '../../generated/prisma/client';
import { OUTBOX_EVENT, OutboxService } from '../outbox';
import { PrismaService } from '../prisma';
import { CATEGORY_REFS, categoryById, type CategoryRef } from './categories';
import { LOCK_LEVEL, isDirectlyReleasable, requiresRequest } from './lock-levels';
import { PinGrantService, type PinGrant } from './pin-grant.service';
import { PinService } from './pin.service';
import { ensureProtection, type Db } from './protection-row';
import {
  toProtectionView,
  type CategoryRefView,
  type ProtectionStateView,
} from './protection.view';
import type {
  SetPinDto,
  ToggleCategoryDto,
  UpdateAccountabilityDto,
  UpdateEnabledDto,
  UpdateLevelDto,
  UpdatePartnerDto,
  UpdateWaitingPeriodDto,
} from './dto';

/**
 * Protection, the lock, and accountability -- three independent things.
 *
 * The one rule the rest of this file exists to serve: a change that *weakens*
 * the barrier at lock level 3 or 4 is refused here and has to go through
 * `POST /requests`, where the delay or the partner actually applies. A lock that
 * the locked-out party can open by calling a different endpoint is not a lock.
 *
 * Every write runs inside `$transaction` together with its outbox row, so a
 * partner can never be notified of a disable that rolled back, and a disable can
 * never commit without the notification being queued.
 */
@Injectable()
export class ProtectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly pins: PinService,
    private readonly grants: PinGrantService,
  ) {}

  async getState(userId: string): Promise<ProtectionStateView> {
    return toProtectionView(await ensureProtection(this.prisma, userId));
  }

  /** The fixed reference table. Static copy, identical for every account. */
  listCategories(): CategoryRefView[] {
    return CATEGORY_REFS.map((ref) => ({
      id: ref.id,
      title: ref.title,
      description: ref.description,
      premium: ref.premium,
    }));
  }

  /**
   * Turning protection ON is always free and immediate -- there is no lock level
   * at which becoming *more* protected needs permission.
   *
   * Turning it OFF is the guarded direction:
   *   level 1  immediate
   *   level 2  immediate, but only with a grant from POST /protection/pin/verify
   *   level 3  409, raise a DELAY request
   *   level 4  409, raise a PARTNER request
   */
  async setEnabled(
    userId: string,
    dto: UpdateEnabledDto,
    headerGrant?: string,
  ): Promise<ProtectionStateView> {
    return this.prisma.$transaction(async (tx) => {
      const row = await ensureProtection(tx, userId);

      if (dto.on) {
        if (row.protectionOn) return toProtectionView(row);
        return toProtectionView(
          await tx.protection.update({ where: { userId }, data: { protectionOn: true } }),
        );
      }

      if (requiresRequest(row.lockLevel)) {
        throw new ConflictException({
          code: 'LOCK_REQUIRES_REQUEST',
          message:
            row.lockLevel === LOCK_LEVEL.DELAY
              ? 'Your waiting period has to run before protection can go off. Raise a request.'
              : 'Your partner has to approve this. Raise a request.',
          details: { lockLevel: row.lockLevel, requestVia: 'POST /requests' },
        });
      }

      // Level 2 with a PIN set: prove the PIN first. Level 2 with no PIN is a
      // half-configured lock, not a lock -- refusing there would strand the
      // account with no way back, so it behaves as level 1.
      if (row.lockLevel === LOCK_LEVEL.PIN && row.pinHash !== null && row.pinHash !== '') {
        if (!this.grants.consume(userId, headerGrant ?? dto.grant)) {
          throw new ForbiddenException({
            code: 'PIN_VERIFICATION_REQUIRED',
            message: 'Verify your PIN first, then send the grant it returns.',
            details: { verifyVia: 'POST /protection/pin/verify' },
          });
        }
      }

      if (!row.protectionOn) return toProtectionView(row);

      const next = await tx.protection.update({
        where: { userId },
        data: { protectionOn: false },
      });
      await this.outbox.emit(tx, {
        aggregateType: 'protection',
        aggregateId: userId,
        eventType: OUTBOX_EVENT.PROTECTION_DISABLED,
        payload: { userId, lockLevel: row.lockLevel, via: 'direct' },
      });
      return toProtectionView(next);
    });
  }

  /**
   * Raising is always immediate. Lowering is immediate from levels 1 and 2 and
   * refused from 3 and 4 -- the single most important rule in the product:
   * lowering a strong lock has to pass through the lock itself, or the lock would
   * be worth nothing.
   */
  async setLevel(userId: string, dto: UpdateLevelDto): Promise<ProtectionStateView> {
    return this.prisma.$transaction(async (tx) => {
      const row = await ensureProtection(tx, userId);
      const from = row.lockLevel;
      const to = dto.level;

      if (to === from) return toProtectionView(row);

      if (to < from && !isDirectlyReleasable(from)) {
        throw new ConflictException({
          code: 'LOCK_REQUIRES_REQUEST',
          message:
            from === LOCK_LEVEL.DELAY
              ? 'Weakening a delay lock has to wait out the delay. Raise a request.'
              : 'Weakening a partner lock needs your partner. Raise a request.',
          details: {
            lockLevel: from,
            targetLevel: to,
            requestVia: 'POST /requests',
            intent: 'lower-level',
          },
        });
      }

      const next = await tx.protection.update({ where: { userId }, data: { lockLevel: to } });
      await this.outbox.emit(tx, {
        aggregateType: 'protection',
        aggregateId: userId,
        eventType: OUTBOX_EVENT.PROTECTION_LEVEL_CHANGED,
        payload: {
          userId,
          from,
          to,
          direction: to > from ? 'raised' : 'lowered',
          via: 'direct',
        },
      });
      return toProtectionView(next);
    });
  }

  async setPin(userId: string, dto: SetPinDto): Promise<ProtectionStateView> {
    // Hashing is deliberately slow, so it happens before the transaction opens
    // rather than holding a row lock for the duration.
    const pinHash = await this.pins.hash(dto.pin);
    await ensureProtection(this.prisma, userId);
    return toProtectionView(
      await this.prisma.protection.update({ where: { userId }, data: { pinHash } }),
    );
  }

  /**
   * A 4-digit PIN is 10,000 possibilities, so the throttle on the controller is
   * load-bearing, not decoration. Nothing here records a failure count -- the
   * schema is frozen and the rate limiter is the lockout.
   */
  async verifyPin(userId: string, pin: string): Promise<PinGrant> {
    const row = await ensureProtection(this.prisma, userId);
    if (row.pinHash === null || row.pinHash === '') {
      throw new ConflictException({
        code: 'PIN_NOT_SET',
        message: 'No PIN has been set on this account.',
      });
    }
    const ok = await this.pins.verify(pin, row.pinHash);
    if (!ok) {
      // 403, not 401: a wrong PIN must not read as an expired session, or the
      // client will bounce the user to sign-in.
      throw new ForbiddenException({ code: 'PIN_INCORRECT', message: 'That PIN is not right.' });
    }
    return this.grants.issue(userId);
  }

  async setWaitingPeriod(
    userId: string,
    dto: UpdateWaitingPeriodDto,
  ): Promise<ProtectionStateView> {
    await ensureProtection(this.prisma, userId);
    return toProtectionView(
      await this.prisma.protection.update({
        where: { userId },
        data: { waitingPeriodMinutes: dto.minutes },
      }),
    );
  }

  /** Only an ACTIVE partner may be set: one who has accepted their invitation. */
  async setPartner(userId: string, dto: UpdatePartnerDto): Promise<ProtectionStateView> {
    return this.prisma.$transaction(async (tx) => {
      const row = await ensureProtection(tx, userId);
      const partnerId = dto.partnerId;

      if (partnerId === null) {
        if (row.partnerId === null) return toProtectionView(row);
        return toProtectionView(
          await tx.protection.update({ where: { userId }, data: { partnerId: null } }),
        );
      }

      // Scoped by userId, so one account cannot name another account's partner.
      const partner = await tx.partner.findFirst({
        where: { id: partnerId, userId },
        select: { id: true, status: true },
      });
      if (partner === null) {
        throw new NotFoundException({
          code: 'PARTNER_NOT_FOUND',
          message: 'No such partner on this account.',
        });
      }
      if (partner.status !== PartnerStatus.ACTIVE) {
        throw new ConflictException({
          code: 'PARTNER_NOT_ACTIVE',
          message: 'Only a partner who has accepted their invitation can approve a request.',
          details: { status: partner.status },
        });
      }

      if (row.partnerId === partner.id) return toProtectionView(row);
      return toProtectionView(
        await tx.protection.update({ where: { userId }, data: { partnerId: partner.id } }),
      );
    });
  }

  /**
   * Turning accountability off clears the approver on the protection row in the
   * same transaction -- but does NOT touch `lockLevel`. A level 4 lock with no
   * approver is a real state the UI flags; silently dropping the lock to 3 here
   * would be the API deciding to weaken a lock on the user's behalf, which is
   * exactly what the rest of this file refuses to do.
   *
   * The `Partner` rows themselves are retained: they hold the invitation history.
   */
  async setAccountability(
    userId: string,
    dto: UpdateAccountabilityDto,
  ): Promise<ProtectionStateView> {
    return this.prisma.$transaction(async (tx) => {
      await ensureProtection(tx, userId);
      return toProtectionView(
        await tx.protection.update({
          where: { userId },
          data: dto.on
            ? { accountabilityOn: true }
            : { accountabilityOn: false, partnerId: null },
        }),
      );
    });
  }

  async toggleCategory(
    userId: string,
    id: string,
    dto: ToggleCategoryDto,
  ): Promise<ProtectionStateView> {
    const ref = categoryById(id);
    if (ref === undefined) {
      throw new NotFoundException({
        code: 'UNKNOWN_CATEGORY',
        message: `No category with id "${id}".`,
        details: { known: CATEGORY_REFS.map((c) => c.id) },
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const row = await ensureProtection(tx, userId);
      const currentlyOn = row.enabledCategories.includes(ref.key);
      const target = dto.on ?? !currentlyOn;

      if (target === currentlyOn) return toProtectionView(row);
      // Gated on the turning-on transition only. Refusing to turn a premium
      // category *off* would trap a downgraded account in a setting it cannot pay
      // for and cannot leave.
      if (target) await this.assertPremiumAllowed(tx, userId, ref);

      const enabledCategories = this.nextCategories(row.enabledCategories, ref, target);
      return toProtectionView(
        await tx.protection.update({
          where: { userId },
          data: { enabledCategories: { set: enabledCategories } },
        }),
      );
    });
  }

  private async assertPremiumAllowed(db: Db, userId: string, ref: CategoryRef): Promise<void> {
    if (!ref.premium) return;
    const subscription = await db.subscription.findUnique({
      where: { userId },
      select: { plan: true },
    });
    // No row is the free tier: a missing subscription must never read as premium.
    if ((subscription?.plan ?? PlanId.FREE) === PlanId.FREE) {
      throw new HttpException(
        {
          code: 'PREMIUM_REQUIRED',
          message: `${ref.title} is part of Premium.`,
          details: { categoryId: ref.id, plan: PlanId.FREE },
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
  }

  /** Rebuilt in the table's canonical order rather than appended to. */
  private nextCategories(
    current: ProtectionCategory[],
    ref: CategoryRef,
    on: boolean,
  ): ProtectionCategory[] {
    const wanted = new Set(current);
    if (on) wanted.add(ref.key);
    else wanted.delete(ref.key);
    return CATEGORY_REFS.filter((c) => wanted.has(c.key)).map((c) => c.key);
  }
}

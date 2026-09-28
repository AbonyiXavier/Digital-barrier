import { RequestIntent, type DisableRequest } from '../../generated/prisma/client';
import { ensureProtection, type Db } from '../protection/protection-row';

/**
 * What approval actually does -- and, just as importantly, what it does not.
 *
 * The two intents clear the same barrier and must not have the same effect:
 *
 *   DISABLE      sets protectionOn = false.  lockLevel is left alone.
 *   LOWER_LEVEL  sets lockLevel = targetLevel.  protectionOn is left alone.
 *
 * Nothing else changes. Not the PIN, not the partner, not the waiting period, not
 * the categories. A user who waited out a delay to lower their lock from 4 to 2
 * has not asked to be unprotected, and one who waited it out to turn protection
 * off has not asked to dismantle the lock that made them wait.
 */

export type ApprovalEffect =
  | { kind: 'disable' }
  | { kind: 'lower-level'; targetLevel: number };

export async function applyApprovalEffect(
  db: Db,
  request: Pick<DisableRequest, 'userId' | 'intent' | 'targetLevel'>,
): Promise<ApprovalEffect> {
  await ensureProtection(db, request.userId);

  if (request.intent === RequestIntent.LOWER_LEVEL) {
    // `request_target_level_matches_intent` guarantees this is set; the throw is
    // for the case where it somehow is not, so the transaction aborts rather than
    // writing a null level.
    if (request.targetLevel === null) {
      throw new Error(`LOWER_LEVEL request for ${request.userId} has no targetLevel`);
    }
    await db.protection.update({
      where: { userId: request.userId },
      data: { lockLevel: request.targetLevel },
    });
    return { kind: 'lower-level', targetLevel: request.targetLevel };
  }

  await db.protection.update({
    where: { userId: request.userId },
    data: { protectionOn: false },
  });
  return { kind: 'disable' };
}

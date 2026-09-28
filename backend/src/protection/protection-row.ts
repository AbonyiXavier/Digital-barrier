import type { Prisma, Protection } from '../../generated/prisma/client';

/**
 * Anything that can run a query: the root client or a transaction client. Every
 * write in these two modules happens inside `$transaction`, so services are
 * written against this rather than against `PrismaService`.
 */
export type Db = Prisma.TransactionClient;

/**
 * The `Protection` row, creating the defaults if the account predates them.
 *
 * The row is meant to be created with the account and is a singleton, so this is
 * not a feature -- it is the difference between a 500 and a working endpoint for
 * any account that was made before that wiring existed. Defaults come from the
 * schema (protection on, level 1, 1440 minutes, adult websites + apps), so the
 * created row is the same one onboarding would have made.
 */
export async function ensureProtection(db: Db, userId: string): Promise<Protection> {
  const existing = await db.protection.findUnique({ where: { userId } });
  if (existing !== null) return existing;
  return db.protection.create({ data: { userId } });
}

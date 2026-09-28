/**
 * Seed data mirroring `mobile/src/data/seed.ts`, so the app looks identical
 * running against a real database as it did against the in-memory store.
 *
 * Idempotent: re-running upserts by email rather than duplicating.
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';

import { PrismaPg } from '@prisma/adapter-pg';
import { hashPassword } from 'better-auth/crypto';
import { Pool } from 'pg';

import { PrismaClient } from '../generated/prisma/client';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const SEED_EMAIL = 'francis@example.com';
const SEED_PASSWORD = 'aegis-dev-password';

const ago = (ms: number): Date => new Date(Date.now() - ms);
const minutes = (n: number): number => n * 60_000;
const hours = (n: number): number => minutes(n * 60);
const days = (n: number): number => hours(n * 24);

/** UTC midnight, `offset` days before today. */
function dayAt(offset: number): Date {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - offset);
  return date;
}

async function main(): Promise<void> {
  // --- account -------------------------------------------------------------
  // Better Auth owns these two tables; we write the same shapes it would, so the
  // seeded account can actually sign in.
  const existing = await prisma.user.findUnique({ where: { email: SEED_EMAIL } });
  const userId = existing?.id ?? randomUUID();

  const user = await prisma.user.upsert({
    where: { email: SEED_EMAIL },
    create: {
      id: userId,
      name: 'Francis Abonyi',
      email: SEED_EMAIL,
      emailVerified: true,
      protectedSince: ago(days(2)),
    },
    update: { name: 'Francis Abonyi', protectedSince: ago(days(2)) },
  });

  const credential = await prisma.account.findFirst({
    where: { userId: user.id, providerId: 'credential' },
  });
  if (!credential) {
    await prisma.account.create({
      data: {
        id: randomUUID(),
        accountId: user.id,
        providerId: 'credential',
        userId: user.id,
        password: await hashPassword(SEED_PASSWORD),
      },
    });
  }

  // --- partners (before protection, which references one) -------------------
  await prisma.partner.upsert({
    where: { userId_clientRef: { userId: user.id, clientRef: 'seed:p_amara' } },
    create: {
      userId: user.id,
      clientRef: 'seed:p_amara',
      name: 'Amara Abonyi',
      relationship: 'Wife',
      email: 'amara@example.com',
      status: 'ACTIVE',
      invitedAt: ago(days(12)),
      respondedAt: ago(days(11)),
    },
    update: {},
  });
  await prisma.partner.upsert({
    where: { userId_clientRef: { userId: user.id, clientRef: 'seed:p_tobe' } },
    create: {
      userId: user.id,
      clientRef: 'seed:p_tobe',
      name: 'Tobe Nwosu',
      relationship: 'Mentor',
      email: 'tobe@example.com',
      status: 'PENDING',
      invitedAt: ago(hours(20)),
    },
    update: {},
  });

  // --- protection ----------------------------------------------------------
  // Level 3 with no approver set, exactly as the prototype seeds it: a valid
  // state that the UI flags rather than prevents.
  await prisma.protection.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      protectionOn: true,
      accountabilityOn: true,
      lockLevel: 3,
      pinHash: null,
      waitingPeriodMinutes: 2880,
      partnerId: null,
      enabledCategories: ['ADULT_WEBSITES', 'ADULT_APPS'],
    },
    update: {},
  });

  await prisma.approvalSettings.upsert({
    where: { userId: user.id },
    create: { userId: user.id, notifyOnDisable: true, notifyOnLevelChange: true, weeklyDigest: false },
    update: {},
  });
  await prisma.notificationSettings.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      blockedAttempts: true,
      partnerActivity: true,
      weeklyReport: true,
      productUpdates: false,
    },
    update: {},
  });
  await prisma.blockedScreenConfig.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      theme: 'CALM',
      headline: 'Not this time.',
      message:
        'You set this barrier up on a clearer day. That version of you is still right.',
      showPartnerButton: true,
      showBreathingExercise: true,
    },
    update: {},
  });
  await prisma.subscription.upsert({
    where: { userId: user.id },
    // FREE with a renewal date violates subscription_renews_at_matches_plan.
    create: { userId: user.id, plan: 'FREE', period: 'MONTHLY', renewsAt: null },
    update: {},
  });

  // --- devices and their daily block counts --------------------------------
  const devices = [
    { ref: 'seed:d_iphone', name: 'Francis’ iPhone', platform: 'IOS', status: 'PROTECTED', seen: minutes(1), blocks: [4, 9, 2, 14, 6, 3, 11], installId: 'seed-install-iphone' },
    { ref: 'seed:d_macbook', name: 'MacBook Pro', platform: 'MACOS', status: 'PROTECTED', seen: minutes(22), blocks: [12, 7, 18, 5, 9, 2, 8], installId: 'seed-install-macbook' },
    { ref: 'seed:d_pixel', name: 'Pixel 8', platform: 'ANDROID', status: 'OFFLINE', seen: days(3), blocks: [0, 1, 0, 3, 0, 0, 0], installId: 'seed-install-pixel' },
    { ref: 'seed:d_pc', name: 'Study PC', platform: 'WINDOWS', status: 'NEEDS_SETUP', seen: days(6), blocks: [0, 0, 0, 0, 0, 0, 0], installId: 'seed-install-pc' },
  ] as const;

  for (const spec of devices) {
    const device = await prisma.device.upsert({
      where: { userId_clientRef: { userId: user.id, clientRef: spec.ref } },
      create: {
        userId: user.id,
        clientRef: spec.ref,
        name: spec.name,
        platform: spec.platform,
        status: spec.status,
        installId: spec.installId,
        lastSeenAt: ago(spec.seen),
      },
      update: { lastSeenAt: ago(spec.seen), status: spec.status },
    });

    // blocks[0] is six days ago, blocks[6] is today -- the orientation the
    // dashboard's sparkline and weekdayLabels() both assume.
    for (const [index, count] of spec.blocks.entries()) {
      const day = dayAt(6 - index);
      await prisma.blockCount.upsert({
        where: { deviceId_day: { deviceId: device.id, day } },
        create: { deviceId: device.id, day, count },
        update: { count },
      });
    }
  }

  // --- the user's own rules ------------------------------------------------
  for (const [domain, list] of [
    ['medicalnewstoday.com', 'ALLOW'],
    ['example-adult-site.com', 'BLOCK'],
  ] as const) {
    await prisma.userRule.upsert({
      where: { userId_domain: { userId: user.id, domain } },
      create: { userId: user.id, domain, list },
      update: { list },
    });
  }

  // --- feeds ---------------------------------------------------------------
  // Metadata only. Versions (and their artifacts) are produced by the refresh
  // job, so seeding a row claiming 74k domains with no artifact behind it would
  // be a lie the Blocklist screen would happily render.
  const feeds = [
    {
      id: 'hagezi-nsfw',
      name: 'HaGeZi NSFW',
      url: 'https://raw.githubusercontent.com/hagezi/dns-blocklists/main/wildcard/nsfw-onlydomains.txt',
      description: 'Adult content. Bare domains, refreshed every few hours.',
      categories: ['ADULT_WEBSITES', 'ADULT_APPS'] as const,
    },
    {
      id: 'hagezi-gambling',
      name: 'HaGeZi Gambling',
      url: 'https://raw.githubusercontent.com/hagezi/dns-blocklists/main/wildcard/gambling-onlydomains.txt',
      description: 'Betting and casino sites.',
      categories: ['GAMBLING'] as const,
    },
    {
      id: 'stevenblack-porn',
      name: 'StevenBlack porn',
      url: 'https://raw.githubusercontent.com/StevenBlack/hosts/master/alternates/porn-only/hosts',
      description: 'Adult content, hosts format.',
      categories: ['ADULT_WEBSITES', 'ADULT_APPS'] as const,
    },
  ];
  for (const feed of feeds) {
    await prisma.feed.upsert({
      where: { id: feed.id },
      create: { ...feed, categories: [...feed.categories], enabled: true, minEntries: 1_000 },
      update: {
        name: feed.name,
        url: feed.url,
        description: feed.description,
        categories: [...feed.categories],
      },
    });
  }

  console.log(`seeded ${SEED_EMAIL} (password: ${SEED_PASSWORD})`);
  console.log(`  ${devices.length} devices, 2 partners, 2 rules, ${feeds.length} feeds`);
  console.log('  run a blocklist refresh to populate feed versions');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });

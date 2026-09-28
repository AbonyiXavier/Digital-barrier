/**
 * The Better Auth instance.
 *
 * This is a module-level singleton rather than a Nest provider because Better
 * Auth's request handler, its type inference (`typeof auth`) and its database
 * hooks all need the instance before Nest's container exists — the integration
 * package takes the finished instance in `AuthModule.forRoot({ auth })`.
 *
 * The cost of that is one extra connection pool: `PrismaService` cannot be
 * injected here, so the adapter gets its own client. Both point at the same
 * database, and nothing in this file writes anything `PrismaService` also owns
 * except through the provisioning helper, which is idempotent.
 */
import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { bearer } from 'better-auth/plugins';
import { Pool } from 'pg';

import { PrismaClient } from '../../generated/prisma/client';
import { validateEnv } from '../config';
import { provisionUserSingletons } from './user-provisioning';

/**
 * `.env` is loaded here, and the environment is validated with the project's own
 * schema, because this file is evaluated while the module graph is still being
 * imported — before `ConfigModule.forRoot()` has run. Reading `process.env`
 * directly at that moment would silently see `undefined` for a secret; going
 * through `validateEnv` turns a misconfiguration into a readable startup error.
 */
const env = validateEnv(process.env);

const pool = new Pool({ connectionString: env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

export const auth = betterAuth({
  /**
   * React Native has no dependable cookie jar, so the mobile client carries the
   * session in an Authorization header instead. This plugin converts that header
   * into the session cookie the rest of Better Auth expects, and echoes the token
   * back in a `set-auth-token` response header for the client to store.
   */
  plugins: [bearer()],
  // The adapter addresses tables by Prisma *model* name lowercased — `User`
  // becomes `prisma.user` — so the `@@map("user")` table names in the schema are
  // invisible to it and no `modelName` overrides are needed. The four models it
  // expects (User, Session, Account, Verification) resolve as-is.
  database: prismaAdapter(prisma, { provider: 'postgresql' }),

  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,

  /**
   * The mobile app and the partner web page are separate origins from the API, so
   * they have to be named here for Better Auth to accept their requests. CORS
   * headers themselves are left to `main.ts` (see `disableTrustedOriginsCors` in
   * `auth.module.ts`) rather than being configured in two places.
   */
  trustedOrigins: [env.BETTER_AUTH_URL, env.PARTNER_WEB_URL, ...env.CORS_ORIGINS],

  emailAndPassword: {
    enabled: true,
    // The app states an eight-character minimum in two places (the sign-up form's
    // helper text and the password-strength copy), so the server enforces eight.
    // Better Auth's own default is 8 as well; stating it keeps the two honest.
    minPasswordLength: 8,
  },

  user: {
    additionalFields: {
      /**
       * Drives "protected for N days", set when onboarding completes.
       *
       * `input: false` matters: this is the number the whole streak is built on,
       * so the client must not be able to post it at sign-up and claim a
       * three-year streak on a one-minute-old account. Only server-side code
       * sets it.
       */
      protectedSince: {
        type: 'date',
        required: false,
        input: false,
      },
    },
  },

  databaseHooks: {
    user: {
      create: {
        /**
         * A new account's five singleton rows, in one transaction.
         *
         * This runs after the user row is committed and is not part of that
         * commit — the Prisma adapter does not expose its own transaction to
         * hooks, and opening a nested interactive transaction is not possible.
         * So the rows are upserted: if this ever fails, the account exists
         * without them and `AuthService.ensureSingletons` repairs it, rather
         * than the failure being silent and unfixable.
         */
        after: async (user): Promise<void> => {
          await prisma.$transaction((tx) => provisionUserSingletons(tx, user.id));
        },
      },
    },
  },
});

/** The session shape Better Auth infers, including `protectedSince`. */
export type AuthInstance = typeof auth;

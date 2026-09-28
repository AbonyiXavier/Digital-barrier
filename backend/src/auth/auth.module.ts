import { Module } from '@nestjs/common';
import { AuthModule as BetterAuthModule } from '@thallesp/nestjs-better-auth';

import { auth } from './auth';
import { AuthService } from './auth.service';

/**
 * The integration package mounts Better Auth's handler on `/api/auth` and
 * registers an `APP_GUARD`, so **every** route in the application is
 * session-protected by default. Opting a route out is explicit and visible at
 * the call site: `@AllowAnonymous()` or `@OptionalAuth()`. The partner-facing
 * `/p/:token/*` endpoints are the only routes in the app that do so.
 *
 * `disableTrustedOriginsCors` is set because the package would otherwise call
 * `enableCors` with Better Auth's `trustedOrigins`, quietly competing with the
 * CORS configuration `main.ts` builds from `CORS_ORIGINS`. One place decides
 * CORS; `trustedOrigins` in `auth.ts` stays purely Better Auth's own origin
 * check.
 */
const betterAuthModule = BetterAuthModule.forRoot({
  auth,
  disableTrustedOriginsCors: true,
});

@Module({
  imports: [betterAuthModule],
  providers: [AuthService],
  // Re-exported so a feature module importing AuthModule gets the guard and the
  // package's AuthService without knowing the integration package exists.
  exports: [betterAuthModule, AuthService],
})
export class AuthModule {}

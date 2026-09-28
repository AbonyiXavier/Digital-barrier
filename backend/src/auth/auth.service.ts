import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma';
import { auth, type AuthInstance } from './auth';
import { provisionUserSingletons } from './user-provisioning';

/**
 * Thin wrapper over the Better Auth singleton.
 *
 * Deliberately small: authentication itself is handled by Better Auth's own
 * routes under `/api/auth`, and the global `AuthGuard` puts the session on the
 * request, so nothing in the app needs a service to "log someone in". What is
 * left is the one thing Nest code does need — a way to repair an account whose
 * singleton rows are missing, since the signup hook commits separately from the
 * user row.
 *
 * Note this is *not* the `AuthService` exported by
 * `@thallesp/nestjs-better-auth`; that one exposes `api` and `instance` and is
 * also available through this module. Import whichever you mean by its path.
 */
@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  /** The Better Auth instance, for server-side calls to `auth.api.*`. */
  get instance(): AuthInstance {
    return auth;
  }

  /**
   * Makes sure a user has the five rows every read path assumes. Idempotent, so
   * it is safe to call on a user that already has them.
   */
  async ensureSingletons(userId: string): Promise<void> {
    await this.prisma.$transaction((tx) => provisionUserSingletons(tx, userId));
  }
}

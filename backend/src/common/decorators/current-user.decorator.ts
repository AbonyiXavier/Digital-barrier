import { createParamDecorator, UnauthorizedException, type ExecutionContext } from '@nestjs/common';

/**
 * The authenticated user's id.
 *
 * Better Auth's Nest integration attaches the session to the request and its
 * global guard rejects unauthenticated calls, so by the time a handler runs this
 * is present. The throw is a guard against a route that opted out of auth with
 * `@AllowAnonymous()` and then asked for a user anyway.
 */
export const CurrentUserId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<{
      session?: { user?: { id?: string } };
      user?: { id?: string };
    }>();
    const id = request.session?.user?.id ?? request.user?.id;
    if (typeof id !== 'string' || id === '') {
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'Sign in to continue.',
      });
    }
    return id;
  },
);

/**
 * The calling device's installation id, from the `x-install-id` header.
 *
 * Used to compute `isCurrent` on device rows, which is a property of the request
 * rather than of the device and so is never stored.
 */
export const InstallId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    const header = ctx.switchToHttp().getRequest<{ headers: Record<string, unknown> }>()
      .headers['x-install-id'];
    return typeof header === 'string' && header !== '' ? header : undefined;
  },
);

import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * Global guard (registered via APP_GUARD). Routes decorated with @Public()
 * skip authentication; everything else requires a valid Bearer JWT handled by
 * the 'jwt' Passport strategy (see modules/auth/strategies/jwt.strategy.ts),
 * which attaches the JwtUser to req.user.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handleRequest(err: any, user: any, _info?: any, _context?: ExecutionContext): any {
    if (err || !user) {
      throw (
        err ||
        new UnauthorizedException({
          code: 'UNAUTHORIZED',
          message: 'Authentication required. Please sign in.',
        })
      );
    }
    return user;
  }
}

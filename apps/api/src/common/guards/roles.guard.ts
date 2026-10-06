import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';

/**
 * Passes when the route has no @Roles() metadata, otherwise requires the
 * authenticated user's roles to overlap with the required roles.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest();
    const userRoles: string[] = req.user?.roles ?? [];
    const ok = required.some((role) => userRoles.includes(role));
    if (!ok) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'You do not have the required role to perform this action.',
      });
    }
    return true;
  }
}

import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** Shape of req.user as produced by JwtStrategy.validate(). */
export interface JwtUser {
  id: string;
  email: string;
  roles: string[];
  permissions: string[];
}

/**
 * @CurrentUser()            -> full JwtUser
 * @CurrentUser('id')        -> just the user id
 */
export const CurrentUser = createParamDecorator(
  (data: keyof JwtUser | undefined, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest();
    const user = req.user as JwtUser | undefined;
    if (!user) return undefined;
    return data ? user[data] : user;
  },
);

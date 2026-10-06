import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';

function mockContext(user: { permissions?: string[] } | undefined): ExecutionContext {
  const req = { user };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('PermissionsGuard', () => {
  const reflector = {
    getAllAndOverride: jest.fn(),
  } as unknown as Reflector;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function guardWith(required: string[] | undefined) {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(required);
    return new PermissionsGuard(reflector);
  }

  it('passes when the route has no @Permissions() metadata', () => {
    const guard = guardWith(undefined);
    expect(guard.canActivate(mockContext(undefined))).toBe(true);
  });

  it('passes when the user holds a required permission', () => {
    const guard = guardWith(['user.read']);
    expect(
      guard.canActivate(mockContext({ permissions: ['user.read', 'deal.read'] })),
    ).toBe(true);
  });

  it('throws 403 with code FORBIDDEN when the permission is missing', () => {
    const guard = guardWith(['user.suspend']);
    try {
      guard.canActivate(mockContext({ permissions: ['user.read'] }));
      fail('expected ForbiddenException');
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenException);
      expect((err as ForbiddenException).getResponse()).toMatchObject({
        code: 'FORBIDDEN',
      });
    }
  });

  it('throws 403 for unauthenticated requests on protected routes', () => {
    const guard = guardWith(['admin.manage']);
    expect(() => guard.canActivate(mockContext(undefined))).toThrow(ForbiddenException);
  });

  it('reads metadata from the PERMISSIONS_KEY', () => {
    const guard = guardWith(['deal.approve']);
    guard.canActivate(mockContext({ permissions: ['deal.approve'] }));
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(
      PERMISSIONS_KEY,
      expect.anything(),
    );
  });
});

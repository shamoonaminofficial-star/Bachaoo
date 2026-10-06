import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../../prisma/prisma.service';
import { JwtUser } from '../../../common/decorators/current-user.decorator';
import { requiredSecret } from '../../../common/utils/required-secret';

/**
 * 'jwt' Passport strategy backing the global JwtAuthGuard.
 * validate() runs on every authenticated request: it reloads the user (so a
 * suspended account or changed roles take effect immediately) and returns the
 * JwtUser attached to req.user.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: requiredSecret('JWT_SECRET', 'dev-secret-change-me'),
    });
  }

  async validate(payload: { sub: string; email: string }): Promise<JwtUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        roles: {
          include: {
            role: {
              include: {
                permissions: { include: { permission: true } },
              },
            },
          },
        },
      },
    });

    // Inactive/suspended/deleted users lose API access immediately.
    if (!user || user.status !== 'ACTIVE') return null;

    const roles = user.roles.map((ur) => ur.role.name);
    const permissions = [
      ...new Set(
        user.roles.flatMap((ur) =>
          ur.role.permissions.map((rp) => rp.permission.key),
        ),
      ),
    ];

    return { id: user.id, email: user.email ?? '', roles, permissions };
  }
}

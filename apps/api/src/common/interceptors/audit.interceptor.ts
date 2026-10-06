import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PrismaService } from '../../prisma/prisma.service';
import { AUDIT_KEY } from '../decorators/audit.decorator';

const SENSITIVE_KEY_PATTERN = /password|secret|token|otp|code/i;

/** Deep-clone via JSON and strip sensitive keys so secrets never land in AuditLog. */
function sanitize(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  let clone: unknown;
  try {
    clone = JSON.parse(JSON.stringify(value));
  } catch {
    return '[unserializable]';
  }
  const strip = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(strip);
    if (node && typeof node === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        out[k] = SENSITIVE_KEY_PATTERN.test(k) ? '[redacted]' : strip(v);
      }
      return out;
    }
    return node;
  };
  return strip(clone);
}

/**
 * Global interceptor. For POST/PUT/PATCH/DELETE requests — or any handler
 * carrying @Audit(action) — writes an AuditLog row after the handler succeeds.
 * Failures in the audit write are swallowed: auditing must never break a request.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const action = this.reflector.getAllAndOverride<string>(AUDIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const req = context.switchToHttp().getRequest();
    const isMutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);

    if (!action && !isMutating) return next.handle();

    const resolvedAction = action ?? `${req.method} ${req.route?.path ?? req.url}`;

    return next.handle().pipe(
      tap({
        next: () => {
          void this.writeAudit(context, resolvedAction).catch((err: Error) =>
            this.logger.warn(`AuditLog write failed: ${err.message}`),
          );
        },
      }),
    );
  }

  private async writeAudit(context: ExecutionContext, action: string): Promise<void> {
    try {
      const req = context.switchToHttp().getRequest();
      const user = req.user as { id?: string; roles?: string[] } | undefined;
      const body = sanitize(req.body);

      await this.prisma.auditLog.create({
        data: {
          actorId: user?.id ?? null,
          actorRole: user?.roles?.[0] ?? null,
          action,
          entity: context.getClass().name,
          entityId: String(req.params?.id ?? (body as Record<string, unknown>)?.id ?? 'n/a'),
          newValues: (body ?? undefined) as never,
          ip: req.ip ?? null,
          userAgent: req.headers?.['user-agent'] ?? null,
        },
      });
    } catch {
      // Never break the request because auditing failed.
    }
  }
}

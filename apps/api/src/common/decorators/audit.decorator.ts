import { SetMetadata } from '@nestjs/common';

export const AUDIT_KEY = 'audit';

/**
 * Tags a mutating endpoint for the AuditInterceptor, which writes an AuditLog
 * row after the handler succeeds. The action should follow the
 * '<resource>.<verb>' convention, e.g. @Audit('deal.approve').
 */
export const Audit = (action: string) => SetMetadata(AUDIT_KEY, action);

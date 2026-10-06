import { IsArray, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { Transform } from 'class-transformer';

/** Phase 9 — DTOs for the admin control panel. All routes are ADMIN/SUPER_ADMIN only. */

export class AdminPaginationDto {
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;
}

export class BatchBusinessesDto {
  @IsArray()
  @IsUUID(undefined, { each: true })
  ids!: string[];

  @IsIn(['suspend', 'reactivate', 'verify'])
  action!: 'suspend' | 'reactivate' | 'verify';

  /** Required for suspend — the partner/admin sees this as the reason. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class BatchDealsDto {
  @IsArray()
  @IsUUID(undefined, { each: true })
  ids!: string[];

  @IsIn(['approve', 'reject', 'pause', 'publish'])
  action!: 'approve' | 'reject' | 'pause' | 'publish';

  /** Required for reject. */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class ModerateReviewDto {
  @IsIn(['APPROVE', 'REJECT'])
  action!: 'APPROVE' | 'REJECT';

  /** Required when rejecting — shown to the reviewer as the removal note. */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class UpdateTicketDto {
  @IsOptional()
  @IsIn(['OPEN', 'IN_PROGRESS', 'WAITING_FOR_CUSTOMER', 'RESOLVED', 'CLOSED'])
  status?: 'OPEN' | 'IN_PROGRESS' | 'WAITING_FOR_CUSTOMER' | 'RESOLVED' | 'CLOSED';

  @IsOptional()
  @IsIn(['LOW', 'MEDIUM', 'HIGH', 'URGENT'])
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

  @IsOptional()
  @IsUUID()
  assignedTo?: string;

  /** Internal note appended to the ticket's message thread by the admin. */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class TicketQueryDto extends AdminPaginationDto {
  @IsOptional()
  @IsIn(['OPEN', 'IN_PROGRESS', 'WAITING_FOR_CUSTOMER', 'RESOLVED', 'CLOSED'])
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}

export class AuditLogQueryDto extends AdminPaginationDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  action?: string;

  @IsOptional()
  @IsUUID()
  actorId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  entity?: string;
}

import { IsEmail, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

/** Invite a staff member to a business by email (Phase 8). */
export class InviteStaffDto {
  @IsEmail()
  email!: string;

  @IsIn(['OWNER', 'MANAGER', 'CASHIER', 'SCANNER'])
  role!: 'OWNER' | 'MANAGER' | 'CASHIER' | 'SCANNER';

  @IsOptional()
  @IsUUID()
  branchId?: string;
}

/** Change a staff member's role. */
export class UpdateStaffRoleDto {
  @IsIn(['OWNER', 'MANAGER', 'CASHIER', 'SCANNER'])
  role!: 'OWNER' | 'MANAGER' | 'CASHIER' | 'SCANNER';
}

/** Filters for the partner redemption ledger. */
export class PartnerRedemptionQueryDto {
  @IsOptional()
  @IsUUID()
  dealId?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  page?: number;

  @IsOptional()
  pageSize?: number;
}

/** Date-range query for partner analytics. */
export class PartnerAnalyticsQueryDto {
  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;
}

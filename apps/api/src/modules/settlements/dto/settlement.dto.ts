import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

/** POST /settlements/run — aggregate a period into a settlement batch. */
export class RunSettlementDto {
  @IsOptional() @IsUUID() businessId?: string;

  @IsString() from!: string; // ISO date

  @IsString() to!: string; // ISO date
}

/** Filters for GET /settlements. */
export class SettlementQueryDto {
  @IsOptional() @IsUUID() businessId?: string;
  @IsOptional() @IsIn(['PENDING', 'PROCESSING', 'PAID', 'DISPUTED', 'CANCELLED']) status?: string;
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
}

/** POST /settlements/:id/mark-paid */
export class MarkPaidDto {
  @IsString() payoutReference!: string;

  @IsOptional() @IsString() method?: string;
}

/** POST /settlements/:id/cancel */
export class CancelSettlementDto {
  @IsString() reason!: string;
}

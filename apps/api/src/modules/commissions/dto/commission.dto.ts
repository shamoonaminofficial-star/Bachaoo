import { IsIn, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

/** Filters for GET /commissions (admin). */
export class CommissionQueryDto {
  @IsOptional() @IsUUID() businessId?: string;
  @IsOptional() @IsIn(['REDEMPTION', 'ADJUSTMENT']) kind?: string;
  @IsOptional() @IsIn(['ACCRUED', 'SETTLED', 'CANCELLED']) status?: string;
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
}

/** Admin adjustment of a commission entry. Creates a new ADJUSTMENT row — history is never edited. */
export class AdjustCommissionDto {
  @IsInt() amountPaisa!: number; // signed delta, paisa

  @IsString() reason!: string;
}

/** Create/update a commission rate rule. Percent XOR fixed. */
export class CommissionRuleDto {
  @IsIn(['GLOBAL', 'CATEGORY', 'BUSINESS']) scope!: string;

  @IsOptional() @IsUUID() businessId?: string;

  @IsOptional() @IsUUID() categoryId?: string;

  @IsIn(['PERCENTAGE', 'FIXED']) type!: string;

  @IsOptional() @IsInt() @Min(0) percentBps?: number;

  @IsOptional() @IsInt() @Min(0) fixedAmount?: number;
}

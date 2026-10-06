import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

/** Admin point adjustment. Every adjustment = one ADJUST ledger row. */
export class AdjustPointsDto {
  @IsString()
  userId!: string;

  /** Positive = credit, negative = debit (debit needs SUPER_ADMIN + approvalNote). */
  @IsInt()
  points!: number;

  /** Required — why is this adjustment happening? Audited. */
  @IsString() @MaxLength(500)
  reason!: string;

  /** Required for negative adjustments; the super-admin's sign-off note. */
  @IsOptional() @IsString() @MaxLength(500)
  approvalNote?: string;
}

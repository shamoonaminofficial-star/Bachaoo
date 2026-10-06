import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength } from 'class-validator';

/** Admin: create a rewards-catalog entry (points → voucher). */
export class CreateRewardDto {
  @IsString() @MinLength(3) @MaxLength(120)
  title!: string;

  @IsString() @MaxLength(2000)
  description!: string;

  /** Points the customer pays. */
  @IsInt() @Min(1)
  pointsCost!: number;

  /** Voucher template minted on redeem. Required — a reward without a linked voucher cannot be fulfilled. */
  @IsUUID()
  voucherId!: string;

  /** Null = unlimited stock. */
  @IsOptional() @IsInt() @Min(0)
  stock?: number | null;
}

/** Admin: update a rewards-catalog entry. */
export class UpdateRewardDto {
  @IsOptional() @IsString() @MinLength(3) @MaxLength(120)
  title?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  description?: string;

  @IsOptional() @IsInt() @Min(1)
  pointsCost?: number;

  @IsOptional() @IsUUID()
  voucherId?: string;

  @IsOptional() @IsInt() @Min(0)
  stock?: number | null;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

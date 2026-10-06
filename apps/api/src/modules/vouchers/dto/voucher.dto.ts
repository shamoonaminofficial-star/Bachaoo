import { IsDateString, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

/** Money arrives as INTEGER paisa (Rs. 1 = 100). Never floats. */
export class CreateVoucherCampaignDto {
  @IsString() @MinLength(3) @MaxLength(120)
  title!: string;

  @IsString() @MaxLength(2000)
  description!: string;

  /** Code prefix printed on the voucher, e.g. BCH (default) or a brand code. */
  @IsOptional() @IsString() @MaxLength(12)
  codePrefix?: string;

  /** How many unique claim codes to generate. */
  @IsInt() @Min(1) @Max(10000)
  totalCount!: number;

  /** Face value in integer paisa. */
  @IsInt() @Min(1)
  valuePaisa!: number;

  /** Voucher only applies when the bill meets this floor (integer paisa). */
  @IsOptional() @IsInt() @Min(0)
  minBillPaisa?: number;

  /** Max codes one customer may claim. */
  @IsOptional() @IsInt() @Min(1) @Max(10)
  perUserLimit?: number;

  @IsDateString()
  startsAt!: string;

  @IsDateString()
  expiresAt!: string;

  /** Restrict the voucher to one business; null = platform-wide. */
  @IsOptional() @IsUUID()
  businessId?: string;
}

export class ClaimVoucherDto {
  /** One of the campaign's pre-generated codes. */
  @IsString() @MinLength(4) @MaxLength(40)
  @Type(() => String)
  code!: string;
}

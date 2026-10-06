import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

/** Mirrors the Prisma DealType enum in schema.prisma. */
export enum DealType {
  PERCENT_OFF = 'PERCENT_OFF',
  FLAT_OFF = 'FLAT_OFF',
  BUY_ONE_GET_ONE = 'BUY_ONE_GET_ONE',
  FREE_ITEM = 'FREE_ITEM',
  CASHBACK = 'CASHBACK',
}

/**
 * All money fields are INTEGER paisa (Rs. 1 = 100). Never floats.
 */
export class CreateDealDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsUUID()
  businessId!: string;

  @IsUUID()
  categoryId!: string;

  @IsOptional()
  @IsUUID()
  subcategoryId?: string;

  @IsString()
  @IsNotEmpty()
  shortDescription!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  terms?: string;

  @IsEnum(DealType)
  dealType!: DealType;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  discountPercent?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxDiscountAmount?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  originalPrice?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  dealPrice?: number;

  @IsOptional()
  @IsBoolean()
  requiresMembership?: boolean;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  eligiblePlanIds?: string[];

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  /**
   * Branch scope: omit (or pass an empty array) for the deal to apply to ALL
   * branches of the business; pass branch ids to restrict it.
   */
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  branchIds?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  usageLimit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  perUserLimit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  dailyLimit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  monthlyLimit?: number;

  /**
   * Days of week the deal is available, e.g. ["MON","TUE"]. Empty = all days.
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  daysAvailable?: string[];

  /** Daily time window "HH:MM". Both or neither. */
  @IsOptional()
  @IsString()
  timeStart?: string;

  @IsOptional()
  @IsString()
  timeEnd?: string;
}

import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { DealType } from './create-deal.dto';

export enum DealSort {
  RECOMMENDED = 'recommended',
  NEARBY = 'nearby',
  NEWEST = 'newest',
  DISCOUNT = 'discount',
  POPULAR = 'popular',
  ENDING = 'ending',
}

export class DealQueryDto {
  /** Full-text-ish search across title, short description and business name. */
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsUUID()
  subcategoryId?: string;

  @IsOptional()
  @IsUUID()
  cityId?: string;

  @IsOptional()
  @IsUUID()
  areaId?: string;

  @IsOptional()
  @IsUUID()
  businessId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  minDiscount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  maxDiscount?: number;

  @IsOptional()
  @IsEnum(DealType)
  dealType?: DealType;

  /** Max member price in paisa: dealPrice <= maxPrice. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxPrice?: number;

  /** Minimum business rating (0-5). */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(5)
  ratingMin?: number;

  @IsOptional()
  @IsIn(['true', 'false'])
  membershipRequired?: 'true' | 'false';

  /**
   * 'true' (default) = only currently live deals (PUBLISHED + within dates).
   * 'false' = also include upcoming PUBLISHED deals (startDate in future).
   */
  @IsOptional()
  @IsIn(['true', 'false'])
  availableNow?: 'true' | 'false';

  /** Geo anchor for `nearby` sort and distance display. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number;

  @IsOptional()
  @IsEnum(DealSort)
  sort?: DealSort = DealSort.RECOMMENDED;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;
}

/** Partner's own deals (all statuses) — same filters minus geo. */
export class MyDealsQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsUUID()
  businessId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;
}

/** Admin approval queue filter. */
export class DealQueueQueryDto {
  @IsOptional()
  @IsIn(['PENDING_APPROVAL', 'APPROVED', 'REJECTED'])
  status?: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' = 'PENDING_APPROVAL';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;
}

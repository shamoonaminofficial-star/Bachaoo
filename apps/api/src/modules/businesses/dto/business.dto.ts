import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export const BUSINESS_SORT_FIELDS = ['rating', 'dealsCount', 'name', 'createdAt'];

export class BusinessQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsUUID()
  cityId?: string;

  @IsOptional()
  @IsUUID()
  areaId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(5)
  ratingMin?: number;

  /** 'true' | 'false' — only businesses with at least one live deal. */
  @IsOptional()
  @IsIn(['true', 'false'])
  hasDeals?: string;

  /** 'true' | 'false' — only verified businesses. */
  @IsOptional()
  @IsIn(['true', 'false'])
  verifiedOnly?: string;

  /** Admin only: 'active' | 'suspended' | 'all'. Ignored for public callers. */
  @IsOptional()
  @IsIn(['active', 'suspended', 'all'])
  status?: 'active' | 'suspended' | 'all';

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  pageSize?: string;

  @IsOptional()
  @IsString()
  sort?: string;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc';
}

export class CreateBusinessDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsString()
  @MinLength(10)
  description!: string;

  @IsUUID()
  categoryId!: string;

  @IsOptional()
  @IsUrl()
  logo?: string;

  @IsOptional()
  @IsUrl()
  coverImage?: string;

  @IsOptional()
  @IsUrl()
  website?: string;

  @IsOptional()
  @Matches(/^(\+92|0)3\d{9}$/, { message: 'phone must be a valid Pakistani number' })
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  email?: string;

  @IsOptional()
  @IsUUID()
  ownerUserId?: string;

  @IsOptional()
  @IsBoolean()
  isVerified?: boolean;
}

export class UpdateBusinessDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(10)
  description?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsUrl()
  logo?: string;

  @IsOptional()
  @IsUrl()
  coverImage?: string;

  @IsOptional()
  @IsUrl()
  website?: string;

  @IsOptional()
  @Matches(/^(\+92|0)3\d{9}$/, { message: 'phone must be a valid Pakistani number' })
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  email?: string;
}

export class SuspendBusinessDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}

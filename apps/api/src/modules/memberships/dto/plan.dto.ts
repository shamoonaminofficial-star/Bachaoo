import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export class CreatePlanDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  /** Optional; auto-generated from name when omitted. */
  @IsOptional()
  @Matches(/^[a-z0-9-]+$/)
  slug?: string;

  @IsString()
  @MaxLength(2000)
  description!: string;

  /** Integer paisa. Server-side only — never accepted from untrusted clients. */
  @IsInt()
  @Min(0)
  regularPrice!: number;

  @IsInt()
  @Min(0)
  salePrice!: number;

  @IsInt()
  @Min(1)
  durationDays!: number;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  benefits!: string[];

  /** 10000 = 1x. Integer basis points — no floats. */
  @IsInt()
  @Min(0)
  rewardMultiplierBps!: number;

  /** 0–100. */
  @IsInt()
  @Min(0)
  @Max(100)
  cashbackPercent!: number;

  /** Empty = all categories. */
  @IsOptional()
  @IsUUID('4', { each: true })
  eligibleCategoryIds?: string[];

  /** Empty = all businesses. */
  @IsOptional()
  @IsUUID('4', { each: true })
  eligibleBusinessIds?: string[];

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  toSlug(): string {
    return this.slug ?? slugify(this.name);
  }
}

export class UpdatePlanDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @Matches(/^[a-z0-9-]+$/)
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  regularPrice?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  salePrice?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  durationDays?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  benefits?: string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  rewardMultiplierBps?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  cashbackPercent?: number;

  @IsOptional()
  @IsUUID('4', { each: true })
  eligibleCategoryIds?: string[];

  @IsOptional()
  @IsUUID('4', { each: true })
  eligibleBusinessIds?: string[];

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

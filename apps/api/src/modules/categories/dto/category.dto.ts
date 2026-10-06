import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class CreateCategoryDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsString()
  @Matches(SLUG_PATTERN, { message: 'slug must be lowercase alphanumeric with hyphens' })
  slug?: string;

  @IsOptional()
  @IsUrl()
  icon?: string;

  @IsOptional()
  @IsUrl()
  image?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateCategoryDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(SLUG_PATTERN, { message: 'slug must be lowercase alphanumeric with hyphens' })
  slug?: string;

  @IsOptional()
  @IsUrl()
  icon?: string;

  @IsOptional()
  @IsUrl()
  image?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ReorderCategoriesDto {
  /** Category ids in the desired display order (first = top). */
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  ids!: string[];
}

export class ToggleCategoryDto {
  @IsBoolean()
  @IsNotEmpty()
  isActive!: boolean;
}

export class CreateSubcategoryDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateSubcategoryDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateBranchDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  managerName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^(\+92|0)3\d{9}$/, { message: 'phone must be a valid Pakistani number' })
  phone?: string;

  @IsString()
  @MinLength(5)
  @MaxLength(300)
  address!: string;

  @IsString()
  cityId!: string; // UUID validated in service (kept string for query compat)

  @IsOptional()
  @IsString()
  areaId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsLatitude()
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsLongitude()
  longitude?: number;

  /**
   * Opening hours as JSON, e.g. {"mon":["09:00","22:00"],"fri":["13:00","23:30"]}.
   * Shape validated in the service (see validateOpeningHours).
   */
  @IsOptional()
  openingHours?: Record<string, [string, string]>;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateBranchDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  managerName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^(\+92|0)3\d{9}$/, { message: 'phone must be a valid Pakistani number' })
  phone?: string;

  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(300)
  address?: string;

  @IsOptional()
  @IsString()
  cityId?: string;

  @IsOptional()
  @IsString()
  areaId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsLatitude()
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsLongitude()
  longitude?: number;

  @IsOptional()
  openingHours?: Record<string, [string, string]>;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class NearbyQueryDto {
  @Type(() => Number)
  @IsNumber()
  @IsLatitude()
  lat!: number;

  @Type(() => Number)
  @IsNumber()
  @IsLongitude()
  lng!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0.5)
  @Max(100)
  radiusKm = 10;
}

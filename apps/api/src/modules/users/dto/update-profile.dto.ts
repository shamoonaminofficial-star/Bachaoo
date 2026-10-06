import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, Matches, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Customer-editable profile fields. Never allow role/status changes here —
 * that stays in the admin-only UpdateUserDto + /users/:id/roles routes.
 */
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  lastName?: string;

  @IsOptional()
  @Matches(/^03\d{9}$/, { message: 'phone must be a valid Pakistani mobile number (03XXXXXXXXX)' })
  phone?: string;

  @IsOptional()
  @IsUUID()
  cityId?: string;

  @IsOptional()
  @IsUUID()
  areaId?: string;

  @IsOptional()
  @Type(() => Date)
  dateOfBirth?: Date;

  @IsOptional()
  @IsIn(['ur', 'en'])
  language?: string;

  @IsOptional()
  @IsBoolean()
  marketingOptIn?: boolean;
}

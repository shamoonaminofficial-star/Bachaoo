import { IsIn, IsOptional, IsString, IsUUID, Matches, MinLength } from 'class-validator';

/**
 * Admin-editable fields only. Roles are managed via POST /users/:id/roles —
 * never allow role escalation through this DTO.
 */
export class UpdateUserDto {
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

  /**
   * Status changes here are audited; prefer the dedicated
   * suspend/reactivate endpoints which require a reason.
   */
  @IsOptional()
  @IsIn(['ACTIVE', 'SUSPENDED'])
  status?: 'ACTIVE' | 'SUSPENDED';
}

import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateRoleDto {
  /** Canonical uppercase key, e.g. MARKETING_MANAGER. Immutable after creation. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}

import { IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';

export class ResetPasswordDto {
  /** Single-use reset token delivered by email (30-min TTL). */
  @IsString()
  @IsNotEmpty()
  token!: string;

  @IsString()
  @MinLength(8, { message: 'password must be at least 8 characters' })
  @Matches(/[A-Za-z]/, { message: 'password must contain at least one letter' })
  @Matches(/\d/, { message: 'password must contain at least one number' })
  newPassword!: string;
}

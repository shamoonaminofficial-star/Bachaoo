import { IsEmail } from 'class-validator';

/** Always returns 200 (even for unknown emails) to prevent account enumeration. */
export class ForgotPasswordDto {
  @IsEmail()
  email!: string;
}

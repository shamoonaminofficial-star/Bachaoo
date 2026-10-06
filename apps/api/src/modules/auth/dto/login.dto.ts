import { IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  /** Email address or phone number (03XXXXXXXXX). */
  @IsString()
  @IsNotEmpty()
  emailOrPhone!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;
}

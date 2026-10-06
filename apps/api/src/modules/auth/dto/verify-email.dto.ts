import { IsNotEmpty, IsString } from 'class-validator';

export class VerifyEmailDto {
  /** JWT issued at registration (24h expiry). */
  @IsString()
  @IsNotEmpty()
  token!: string;
}

import { IsString } from 'class-validator';

/** Body for POST /redemptions/validate (partner scan). */
export class ValidateQrDto {
  /** Signed short-lived QR token issued by POST /redemptions/qr. */
  @IsString()
  token!: string;
}

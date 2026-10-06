import { IsIn, IsNotEmpty, IsString, Length, Matches } from 'class-validator';

/**
 * OTP target: a phone number (sms/whatsapp) or an email address (email).
 * The service validates the format against the chosen channel.
 */
export class OtpRequestDto {
  @IsString()
  @IsNotEmpty()
  identifier!: string;

  @IsIn(['email', 'sms', 'whatsapp'], {
    message: 'channel must be one of: email, sms, whatsapp',
  })
  channel: 'email' | 'sms' | 'whatsapp' = 'sms';
}

export class OtpVerifyDto {
  @IsString()
  @IsNotEmpty()
  identifier!: string;

  @IsString()
  @IsNotEmpty()
  @Length(6, 6, { message: 'code must be 6 digits' })
  @Matches(/^\d{6}$/, { message: 'code must be 6 digits' })
  code!: string;
}

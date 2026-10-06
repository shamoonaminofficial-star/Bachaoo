import {
  Equals,
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  firstName!: string;

  @IsString()
  @IsNotEmpty()
  lastName!: string;

  @IsEmail()
  email!: string;

  // Pakistani mobile: 03XXXXXXXXX (11 digits). Adjust if international support is added.
  @Matches(/^03\d{9}$/, { message: 'phone must be a valid Pakistani mobile number (03XXXXXXXXX)' })
  phone!: string;

  @IsString()
  @MinLength(8, { message: 'password must be at least 8 characters' })
  @Matches(/[A-Za-z]/, { message: 'password must contain at least one letter' })
  @Matches(/\d/, { message: 'password must contain at least one number' })
  password!: string;

  @IsOptional()
  @IsUUID()
  cityId?: string;

  /**
   * Optional referral code of an existing customer. When present and valid, a
   * Referral record is created (status INVITED); the actual reward is granted
   * later when the qualifying event (e.g. first membership purchase) happens.
   */
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z0-9]{4,16}$/, { message: 'referralCode is invalid' })
  referralCode?: string;

  @IsBoolean()
  @Equals(true, { message: 'You must accept the terms to register' })
  acceptTerms!: boolean;
}

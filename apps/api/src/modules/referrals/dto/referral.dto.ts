import { IsString, MaxLength, MinLength } from 'class-validator';

/** Apply a referral code after signup (within 7 days). */
export class ApplyReferralDto {
  @IsString() @MinLength(4) @MaxLength(32)
  code!: string;
}

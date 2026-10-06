import { IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

/** Cashback withdrawal request. Money is integer paisa. */
export class WithdrawCashbackDto {
  @IsInt() @Min(1)
  amountPaisa!: number;

  @IsEnum(['BANK', 'EASYPAISA', 'JAZZCASH'])
  method!: 'BANK' | 'EASYPAISA' | 'JAZZCASH';

  /** Bank account / mobile wallet number the payout goes to. */
  @IsString() @MaxLength(100)
  accountDetails!: string;

  /** Optional client idempotency key (also accepted via `Idempotency-Key` header). */
  @IsOptional() @IsString() @MaxLength(100)
  idempotencyKey?: string;
}

export class ModerateWithdrawalDto {
  @IsOptional() @IsString() @MaxLength(100)
  payoutReference?: string;

  @IsOptional() @IsString() @MaxLength(500)
  reason?: string;
}

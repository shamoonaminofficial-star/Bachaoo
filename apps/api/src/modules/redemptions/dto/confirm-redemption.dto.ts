import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

/**
 * Money arrives as INTEGER paisa (Rs. 1 = 100). Never floats.
 * All discount/saving/cashback/points math is recomputed server-side from the
 * bill amount and the deal/plan rows — client values are never trusted.
 *
 * The branch is NOT accepted here: it was fixed at QR mint time and is
 * carried by the signed token + server-side issuance record.
 */
export class ConfirmRedemptionDto {
  /** Signed short-lived QR token issued by POST /redemptions/qr. */
  @IsString()
  token!: string;

  /** Final bill amount in integer paisa. */
  @IsInt()
  @Min(1)
  billAmountPaisa!: number;

  /**
   * Optional customer voucher code (from the customer's claimed vouchers).
   * Validated + consumed server-side: ownership, not used, not expired,
   * campaign live, min-bill met, business match. The voucher value is added
   * to the discount inside the same DB transaction.
   */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  voucherCode?: string;
}

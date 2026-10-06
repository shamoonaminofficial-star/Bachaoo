import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * Multipart receipt upload: the file itself comes as the `file` field
 * (image or PDF, ≤5 MB, validated in the service); these are the sender's
 * bank details for cross-checking against the bank statement.
 */
export class ManualReceiptDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  bankName?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  accountTitle?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  iban?: string;
}

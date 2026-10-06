import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class RefundPaymentDto {
  /** Integer paisa. Omit for a full refund of the payment amount. */
  @IsOptional()
  @IsInt()
  @Min(1)
  amount?: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}

export class PaymentQueryDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  gateway?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  pageSize?: string;
}

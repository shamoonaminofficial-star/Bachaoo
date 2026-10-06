import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { PaymentGateway } from '../../memberships/dto/purchase-plan.dto';

export enum PaymentOrderType {
  MEMBERSHIP = 'MEMBERSHIP',
  VOUCHER = 'VOUCHER',
}

export class CreateIntentDto {
  @IsEnum(PaymentOrderType)
  orderType!: PaymentOrderType;

  /** For MEMBERSHIP orders. */
  @IsOptional()
  @IsUUID()
  planId?: string;

  /** For non-membership orders: the referenced order id. */
  @IsOptional()
  @IsString()
  orderId?: string;

  @IsEnum(PaymentGateway)
  gateway!: PaymentGateway;

  /** Integer paisa. Required for non-membership orders (ignored for MEMBERSHIP — price comes from the plan). */
  @IsOptional()
  @IsInt()
  @Min(1)
  amount?: number;
}

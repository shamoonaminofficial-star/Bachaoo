import { IsEnum, IsUUID } from 'class-validator';

export enum PaymentGateway {
  STRIPE = 'STRIPE',
  JAZZCASH = 'JAZZCASH',
  EASYPASA = 'EASYPASA',
  BANK_TRANSFER = 'BANK_TRANSFER',
  MANUAL = 'MANUAL',
}

export class PurchasePlanDto {
  @IsUUID()
  planId!: string;

  @IsEnum(PaymentGateway)
  gateway!: PaymentGateway;
}

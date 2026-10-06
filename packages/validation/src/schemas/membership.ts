import { z } from 'zod';

// Gateways mirror the Prisma PaymentGateway enum.
export const paymentGatewayEnum = z.enum([
  'STRIPE',
  'JAZZCASH',
  'EASYPASA',
  'BANK_TRANSFER',
  'MANUAL',
]);

export const membershipPurchaseSchema = z.object({
  planId: z.string().uuid('Invalid plan id'),
  gateway: paymentGatewayEnum,
});
export type MembershipPurchaseInput = z.infer<typeof membershipPurchaseSchema>;

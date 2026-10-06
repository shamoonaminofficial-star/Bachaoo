import { z } from 'zod';

export const redemptionConfirmSchema = z.object({
  // Short-lived single-use QR token minted at the counter.
  token: z.string().min(1, 'Token is required'),
  branchId: z.string().uuid('Invalid branch id').optional(),
  // Final bill before discount, in paisa.
  billAmount: z.number().int().min(1, 'Bill amount must be at least 1 paisa'),
});
export type RedemptionConfirmInput = z.infer<typeof redemptionConfirmSchema>;

import { z } from 'zod';

export const reviewCreateSchema = z.object({
  businessId: z.string().uuid('Invalid business id'),
  dealId: z.string().uuid('Invalid deal id').optional(),
  rating: z.number().int().min(1, 'Rating must be at least 1').max(5, 'Rating is at most 5'),
  body: z.string().max(1000, 'Review is too long').optional(),
});
export type ReviewCreateInput = z.infer<typeof reviewCreateSchema>;

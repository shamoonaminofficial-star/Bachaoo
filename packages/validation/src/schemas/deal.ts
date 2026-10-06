import { z } from 'zod';

// Deal types mirror the Prisma DealType enum.
export const dealTypeEnum = z.enum([
  'PERCENTAGE',
  'FLAT',
  'BUY_ONE_GET_ONE',
  'FREE_ITEM',
  'CASHBACK',
]);

export const dealCreateSchema = z
  .object({
    title: z.string().min(5, 'Title must be at least 5 characters').max(120),
    description: z.string().min(1, 'Description is required'),
    categoryId: z.string().uuid('Invalid category id'),
    subcategoryId: z.string().uuid('Invalid subcategory id').optional(),
    dealType: dealTypeEnum,
    discountPercent: z.number().int().min(1).max(90),
    maxDiscountAmount: z.number().int().positive().optional(), // paisa
    originalPrice: z.number().int().nonnegative().optional(), // paisa
    dealPrice: z.number().int().nonnegative().optional(), // paisa
    requiresMembership: z.boolean().optional(),
    eligiblePlanIds: z.array(z.string().uuid()).optional(),
    branchIds: z.array(z.string().uuid()).optional(), // empty = all branches
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    daysAvailable: z.array(z.string()).optional(),
    timeStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM').optional(),
    timeEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM').optional(),
    usageLimit: z.number().int().positive().optional(),
    perUserLimit: z.number().int().positive().optional(),
    terms: z.string().optional(),
  })
  .refine((d) => d.endDate > d.startDate, {
    message: 'End date must be after start date',
    path: ['endDate'],
  })
  .refine(
    (d) =>
      d.originalPrice === undefined ||
      d.dealPrice === undefined ||
      d.dealPrice <= d.originalPrice,
    { message: 'Deal price cannot exceed original price', path: ['dealPrice'] },
  );
export type DealCreateInput = z.infer<typeof dealCreateSchema>;

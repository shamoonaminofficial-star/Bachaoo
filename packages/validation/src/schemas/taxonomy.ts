import { z } from 'zod';

export const countrySchema = z.object({
  name: z.string().min(2).max(100),
  code: z.string().min(2).max(4),
  currency: z.string().max(8).optional(),
  timezone: z.string().max(64).optional(),
});

export const citySchema = z.object({
  name: z.string().min(2).max(100),
  isDefault: z.boolean().optional(),
});

export const areaSchema = z.object({
  name: z.string().min(2).max(100),
});

export const categorySchema = z.object({
  name: z.string().min(2).max(80),
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase alphanumeric with hyphens')
    .optional(),
  icon: z.string().url().optional(),
  image: z.string().url().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export const subcategorySchema = z.object({
  name: z.string().min(2).max(80),
  sortOrder: z.number().int().min(0).optional(),
});

export const reorderSchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
});

const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;
const dayEnum = z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);

export const openingHoursSchema = z
  .record(dayEnum, z.tuple([z.string().regex(timeRe), z.string().regex(timeRe)]))
  .optional();

export const branchSchema = z.object({
  name: z.string().min(2).max(120),
  managerName: z.string().max(120).optional(),
  phone: z.string().optional(),
  address: z.string().min(5).max(300),
  cityId: z.string().uuid(),
  areaId: z.string().uuid().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  openingHours: openingHoursSchema,
  isActive: z.boolean().optional(),
});

export type CategoryInput = z.infer<typeof categorySchema>;
export type BranchInput = z.infer<typeof branchSchema>;

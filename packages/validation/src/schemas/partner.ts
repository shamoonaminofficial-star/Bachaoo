import { z } from 'zod';
import { pakistanPhoneRegex } from './auth';

const optionalUrl = z.string().url('Invalid URL').optional();

export const partnerApplicationSchema = z.object({
  businessName: z.string().min(2, 'Business name is too short'),
  ownerName: z.string().min(2, 'Owner name is too short'),
  email: z.string().email('Invalid email address'),
  phone: z.string().regex(pakistanPhoneRegex, 'Enter a valid Pakistani mobile number'),
  whatsapp: z
    .string()
    .regex(pakistanPhoneRegex, 'Enter a valid Pakistani mobile number')
    .optional(),
  categoryId: z.string().uuid('Invalid category id'),
  cityId: z.string().uuid('Invalid city id'),
  area: z.string().min(2, 'Area is required'),
  address: z.string().min(5, 'Address is too short'),
  description: z.string().min(20, 'Tell us a bit more (at least 20 characters)'),
  website: optionalUrl,
  instagram: optionalUrl,
  facebook: optionalUrl,
});
export type PartnerApplicationInput = z.infer<typeof partnerApplicationSchema>;

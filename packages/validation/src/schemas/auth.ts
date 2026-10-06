import { z } from 'zod';

/** Pakistani mobile number: +92 3XX XXXXXXX or 03XX XXXXXXX */
export const pakistanPhoneRegex = /^(\+92|0)3\d{9}$/;

/** Password must be ≥8 chars with at least one letter and one number. */
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/\d/, 'Password must contain a number');

export const registerSchema = z.object({
  firstName: z.string().min(2, 'First name is too short'),
  lastName: z.string().min(2, 'Last name is too short'),
  email: z.string().email('Invalid email address'),
  phone: z.string().regex(pakistanPhoneRegex, 'Enter a valid Pakistani mobile number'),
  password: passwordSchema,
  cityId: z.string().uuid('Invalid city id'),
  acceptTerms: z.literal(true, {
    errorMap: () => ({ message: 'You must accept the terms' }),
  }),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  emailOrPhone: z.string().min(1, 'Email or phone is required'),
  password: z.string().min(1, 'Password is required'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const otpRequestSchema = z.object({
  phone: z.string().regex(pakistanPhoneRegex, 'Enter a valid Pakistani mobile number'),
});
export type OtpRequestInput = z.infer<typeof otpRequestSchema>;

export const otpVerifySchema = z.object({
  phone: z.string().regex(pakistanPhoneRegex, 'Enter a valid Pakistani mobile number'),
  code: z.string().length(6, 'Code must be 6 digits'),
});
export type OtpVerifyInput = z.infer<typeof otpVerifySchema>;

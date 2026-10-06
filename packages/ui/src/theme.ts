/**
 * Bachatly design tokens.
 * Single source of truth for the brand theme. Change colors here and they
 * propagate everywhere via the Tailwind preset below.
 */

export const colors = {
  brand: {
    50: '#ECF7F1',
    100: '#D1EBDF',
    200: '#A6D7C1',
    300: '#74BE9E',
    400: '#3FA37B',
    500: '#128A63',
    600: '#0B6B4F', // primary
    700: '#095C44', // primary-dark
    800: '#084A38',
    900: '#063B2D',
    950: '#042A20',
  },
  ink: {
    DEFAULT: '#101820', // secondary
    soft: '#1C2530',
    muted: '#3A4654',
  },
  accent: {
    DEFAULT: '#FFB020',
    dark: '#E59400',
    soft: '#FFF3D9',
  },
  success: '#15803D', // 5.02:1 on white — passes WCAG AA for body text
  warning: '#F59E0B',
  error: '#DC2626',
  info: '#2563EB',
} as const;

export const radii = {
  card: '1rem', // rounded-2xl
  pill: '9999px',
  control: '0.75rem',
} as const;

export const shadows = {
  card: '0 1px 2px rgb(16 24 32 / 0.05), 0 8px 24px -12px rgb(16 24 32 / 0.18)',
  pop: '0 12px 40px -12px rgb(16 24 32 / 0.28)',
} as const;

export const fontFamily = {
  sans: [
    '-apple-system',
    'BlinkMacSystemFont',
    '"Segoe UI"',
    'Roboto',
    '"Helvetica Neue"',
    'Arial',
    '"Noto Sans"',
    'sans-serif',
  ],
} as const;

/** Tailwind preset fragment — spread into tailwind.config.ts `theme.extend`. */
export const tailwindPreset = {
  colors: {
    brand: colors.brand,
    ink: colors.ink,
    accent: { DEFAULT: colors.accent.DEFAULT, dark: colors.accent.dark, soft: colors.accent.soft },
    success: colors.success,
    warning: colors.warning,
    error: colors.error,
    info: colors.info,
  },
  fontFamily: { sans: [...fontFamily.sans] },
  borderRadius: { card: radii.card },
  boxShadow: { card: shadows.card, pop: shadows.pop },
} as const;

export type BachatlyColors = typeof colors;

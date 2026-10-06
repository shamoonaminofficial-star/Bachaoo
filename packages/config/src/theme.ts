// Bachatly design tokens — single source of truth.
// Change a token here and it updates globally across web + admin + partner UIs.

export const theme = {
  colors: {
    primary: '#0E9F6E',
    primaryDark: '#0B7A56',
    primaryLight: '#E6F7F0',
    secondary: '#0F172A',
    accent: '#F59E0B',
    success: '#16A34A',
    warning: '#D97706',
    error: '#DC2626',
    neutral: {
      50: '#F8FAFC',
      100: '#F1F5F9',
      200: '#E2E8F0',
      300: '#CBD5E1',
      400: '#94A3B8',
      500: '#64748B',
      600: '#475569',
      700: '#334155',
      800: '#1E293B',
      900: '#0F172A',
    },
  },
  radius: {
    sm: '0.375rem',
    md: '0.5rem',
    lg: '0.75rem',
    xl: '1rem',
    full: '9999px',
  },
  fontFamily: {
    sans: ['Inter', 'system-ui', 'sans-serif'],
  },
} as const;

export type Theme = typeof theme;

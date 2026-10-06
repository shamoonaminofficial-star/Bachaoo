import type { Config } from 'tailwindcss';
import { tailwindPreset } from '../../packages/ui/src/theme';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  theme: { extend: { ...(tailwindPreset as object) } },
  plugins: [],
};
export default config;

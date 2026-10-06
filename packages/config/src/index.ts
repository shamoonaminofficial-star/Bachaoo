// @bachatly/config — environment parsing (server-only) + design tokens.
// WARNING: src/env.ts is server-only. Never import it in frontend code —
// it would bundle secrets. The web app may import ./theme only.

export * from './env';
export * from './theme';

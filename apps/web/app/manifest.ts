import type { MetadataRoute } from 'next';

/**
 * PWA web app manifest.
 *
 * Icons: `icon.svg` plus generated 192/512 PNGs in `public/icons/`
 * (regenerate from `app/icon.svg` with any image tool if the mark changes).
 * For full install-banner polish, replace with the final brand artwork
 * before launch (including a 180×180 apple-touch-icon).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Bachatly — Save More. Live More.',
    short_name: 'Bachatly',
    description: 'Exclusive deals, discounts, vouchers and rewards from businesses around you.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#0B6B4F',
    lang: 'en',
    dir: 'ltr',
    categories: ['shopping', 'lifestyle', 'finance'],
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  };
}

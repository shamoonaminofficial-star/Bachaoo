/** @type {import('next').NextConfig} */
// Storage host is env-driven: set NEXT_PUBLIC_STORAGE_HOST to the S3/MinIO
// hostname (without protocol) when uploads live on a custom domain.
const storageHost = process.env.NEXT_PUBLIC_STORAGE_HOST;

const nextConfig = {
  reactStrictMode: true,
  // Workspace packages ship TypeScript source — transpile them.
  transpilePackages: ['@bachatly/ui', '@bachatly/validation', '@bachatly/types'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.amazonaws.com' },
      { protocol: 'https', hostname: '**.bachatly.pk' },
      ...(storageHost ? [{ protocol: 'https', hostname: storageHost }] : []),
      { protocol: 'http', hostname: 'localhost' },
    ],
  },
  async headers() {
    return [{
      source: '/(.*)',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      ],
    }];
  },
};
export default nextConfig;

import type { MetadataRoute } from 'next';
const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://bachatly.pk';
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: '*', allow: '/', disallow: ['/account/', '/admin/', '/partner/dashboard/', '/api/'] }], sitemap: `${base}/sitemap.xml` };
}

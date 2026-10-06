import type { Metadata, Viewport } from 'next';
import { ToastProvider } from '@bachatly/ui';
import { AuthProvider } from '@/lib/auth';
import './globals.css';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://bachatly.pk';

export const viewport: Viewport = {
  themeColor: '#0B6B4F',
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: 'Bachatly — Save More. Live More.', template: '%s | Bachatly' },
  description: 'Discover exclusive deals, discounts, vouchers and rewards from businesses around you. Join Bachatly membership and start saving today.',
  keywords: ['deals', 'discounts', 'membership', 'vouchers', 'cashback', 'rewards', 'Pakistan', 'Karachi', 'Lahore', 'Islamabad'],
  alternates: { canonical: siteUrl },
  openGraph: {
    type: 'website', siteName: 'Bachatly', title: 'Bachatly — Save More. Live More.',
    description: 'Exclusive deals, discounts, vouchers and rewards from businesses around you.',
    images: [{ url: '/og-cover.png', width: 1200, height: 630, alt: 'Bachatly — Save More. Live More.' }],
  },
  twitter: { card: 'summary_large_image', title: 'Bachatly — Save More. Live More.', description: 'Exclusive deals, discounts, vouchers and rewards from businesses around you.' },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 font-sans text-ink antialiased">
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-xl focus:bg-brand-600 focus:px-4 focus:py-2 focus:font-bold focus:text-white">
          Skip to content
        </a>
        <ToastProvider>
          <AuthProvider>{children}</AuthProvider>
        </ToastProvider>
      </body>
    </html>
  );
}

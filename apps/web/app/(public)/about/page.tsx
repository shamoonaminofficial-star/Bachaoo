import { Breadcrumbs, Card } from '@bachatly/ui';
import CmsContent from '@/components/CmsContent';
export const metadata = { title: 'About Us' };
export default function AboutPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-6 lg:px-6">
      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'About' }]} />
      <CmsContent slug="about" fallback={(
        <>
          <h1 className="mt-3 text-3xl font-extrabold text-ink">About Bachatly</h1>
          <Card className="mt-4 space-y-4 p-6 text-sm leading-relaxed text-slate-600">
            <p><strong className="text-ink">Bachatly</strong> (from "bachat" — savings) is Pakistan's smart savings club. Members unlock exclusive discounts, vouchers, cashback and rewards at thousands of local partner businesses — from restaurants and salons to auto care and fashion.</p>
            <p>Our mission is simple: <em>Save More. Live More.</em> We help customers keep more of what they earn, and help local businesses reach customers who are ready to spend.</p>
            <p className="text-xs text-slate-400">This page is CMS-managed in production (Admin → CMS → About).</p>
          </Card>
        </>
      )} />
    </div>
  );
}

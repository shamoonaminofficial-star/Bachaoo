import { Breadcrumbs, Card } from '@bachatly/ui';
import CmsContent from '@/components/CmsContent';
export const metadata = { title: 'Privacy Policy' };
export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-6 lg:px-6">
      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Privacy Policy' }]} />
      <CmsContent slug="privacy" fallback={(
        <>
          <h1 className="mt-3 text-3xl font-extrabold text-ink">Privacy Policy</h1>
          <Card className="mt-4 space-y-3 p-6 text-sm leading-relaxed text-slate-600">
            <p><strong className="text-ink">1. Data we collect.</strong> Account details, membership activity, redemptions, and — only with your permission — location for nearby deals.</p>
            <p><strong className="text-ink">2. How we use it.</strong> To operate your membership, personalize offers, prevent fraud, and improve the platform.</p>
            <p><strong className="text-ink">3. Sharing.</strong> We never sell personal data. Limited data (e.g. first name, membership status) is shared with a partner only at the moment you redeem.</p>
            <p><strong className="text-ink">4. Your rights.</strong> You may request access, correction or deletion of your data via support@bachatly.pk.</p>
            <p className="text-xs text-slate-400">CMS-managed in production (Admin → CMS → Privacy). Last updated: October 2026.</p>
          </Card>
        </>
      )} />
    </div>
  );
}

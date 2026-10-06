import { Breadcrumbs, Card } from '@bachatly/ui';
import CmsContent from '@/components/CmsContent';
export const metadata = { title: 'Terms & Conditions' };
export default function TermsPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-6 lg:px-6">
      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Terms & Conditions' }]} />
      <CmsContent slug="terms" fallback={(
        <>
          <h1 className="mt-3 text-3xl font-extrabold text-ink">Terms & Conditions</h1>
          <Card className="mt-4 space-y-3 p-6 text-sm leading-relaxed text-slate-600">
            <p><strong className="text-ink">1. Membership.</strong> Bachatly memberships are personal and non-transferable. Benefits apply only at participating partner businesses while your membership is active.</p>
            <p><strong className="text-ink">2. Deals.</strong> Offers are subject to availability, partner terms, and stated validity periods. Discounts cannot be combined unless explicitly stated.</p>
            <p><strong className="text-ink">3. Redemption.</strong> QR tokens are single-use and time-limited. Misuse, duplication or fraud may result in suspension.</p>
            <p><strong className="text-ink">4. Payments.</strong> Membership fees are collected via supported gateways. Failed or disputed payments may pause membership benefits.</p>
            <p className="text-xs text-slate-400">CMS-managed in production (Admin → CMS → Terms). Last updated: October 2026.</p>
          </Card>
        </>
      )} />
    </div>
  );
}

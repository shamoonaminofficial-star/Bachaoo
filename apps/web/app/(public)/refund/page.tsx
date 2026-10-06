import { Breadcrumbs, Card } from '@bachatly/ui';
export const metadata = { title: 'Refund Policy' };
export default function RefundPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-6 lg:px-6">
      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Refund Policy' }]} />
      <h1 className="mt-3 text-3xl font-extrabold text-ink">Refund Policy</h1>
      <Card className="mt-4 space-y-3 p-6 text-sm leading-relaxed text-slate-600">
        <p><strong className="text-ink">1. Membership refunds.</strong> Full refund within 7 days of purchase if no redemption has been made. Partial or no refund after first redemption, at our discretion.</p>
        <p><strong className="text-ink">2. Voucher purchases.</strong> Refundable before redemption and within the voucher validity period.</p>
        <p><strong className="text-ink">3. How to request.</strong> Open a support ticket from your account with your payment reference.</p>
        <p><strong className="text-ink">4. Processing.</strong> Approved refunds are processed to the original payment method within 7–14 business days.</p>
        <p className="text-xs text-slate-400">CMS-managed in production (Admin → CMS → Refund Policy). Last updated: October 2026.</p>
      </Card>
    </div>
  );
}

'use client';
import React, { useEffect, useState } from 'react';
import { Breadcrumbs, Accordion, Skeleton } from '@bachatly/ui';
import { fetchFaq, type FaqItem } from '@/lib/engagement';

const STATIC_FAQ: FaqItem[] = [
  { question: 'What is Bachatly?', answer: 'Bachatly is a membership-based savings platform. Members get exclusive discounts, vouchers, cashback and rewards at partner businesses across Pakistan.' },
  { question: 'How do I redeem a deal?', answer: 'Tap "Redeem Offer" on any deal, show the generated QR code to the partner, and they scan it. Your discount is calculated and recorded automatically.' },
  { question: 'Is my QR code safe to screenshot?', answer: 'No need — QR codes contain short-lived signed tokens (60–120 seconds) that expire automatically and cannot be reused.' },
  { question: 'How do I earn reward points?', answer: 'Through membership purchase, redemptions, referrals and promotions. Exchange points for vouchers in the Rewards marketplace.' },
  { question: 'How does cashback work?', answer: 'Eligible redemptions earn cashback to your wallet. Once approved, it becomes available to redeem against vouchers and rewards.' },
  { question: 'How do referrals work?', answer: 'Share your unique referral code. When a friend joins and completes the qualifying event, you both earn rewards.' },
];

export default function FaqsPage() {
  const [faq, setFaq] = useState<FaqItem[]>(STATIC_FAQ);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let live = true;
    fetchFaq()
      .then((f) => { if (live && f && f.length > 0) setFaq(f); })
      .catch(() => {})
      .finally(() => { if (live) setReady(true); });
    return () => { live = false; };
  }, []);

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 lg:px-6">
      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'FAQs' }]} />
      <h1 className="mt-3 text-3xl font-extrabold text-ink">Frequently Asked Questions</h1>
      {!ready ? (
        <div className="mt-4 space-y-2"><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></div>
      ) : (
        <div className="mt-4"><Accordion items={faq.map((f) => ({ title: f.question, content: f.answer }))} /></div>
      )}
      <p className="mt-4 text-xs text-slate-400">CMS-managed in production (Admin → CMS → FAQs).</p>
    </div>
  );
}

'use client';
import React from 'react';
import { Card, EmptyState } from '@bachatly/ui';

export default function AdminReferralsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold text-ink">Referrals</h1>
      <Card className="p-4">
        <EmptyState title="Referral admin is not live yet" icon="🤝"
          description="The referrals backend module is still a stub. Once the admin referral endpoints land (referral list, reward rules), referrals will be managed here." />
      </Card>
    </div>
  );
}

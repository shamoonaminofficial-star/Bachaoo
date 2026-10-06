'use client';
import React from 'react';
import { Card, EmptyState } from '@bachatly/ui';

export default function AdminWalletPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold text-ink">Wallet</h1>
      <Card className="p-4">
        <EmptyState title="Wallet admin is not live yet" icon="👛"
          description="The wallet backend module is still a stub. Once the admin wallet endpoints land (ledger search, manual adjustments with audit), this page will manage them." />
      </Card>
    </div>
  );
}

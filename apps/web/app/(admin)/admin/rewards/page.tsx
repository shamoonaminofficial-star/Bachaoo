'use client';
import React from 'react';
import { Card, EmptyState } from '@bachatly/ui';

export default function AdminRewardsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold text-ink">Rewards</h1>
      <Card className="p-4">
        <EmptyState title="Reward admin is not live yet" icon="⭐"
          description="The rewards backend module is still a stub. Once the admin reward endpoints land (marketplace items, manual grants with ledger entries), rewards will be managed here." />
      </Card>
    </div>
  );
}

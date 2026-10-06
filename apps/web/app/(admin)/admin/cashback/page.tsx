'use client';
import React from 'react';
import { Card, EmptyState } from '@bachatly/ui';

export default function AdminCashbackPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold text-ink">Cashback</h1>
      <Card className="p-4">
        <EmptyState title="Cashback admin is not live yet" icon="💸"
          description="The cashback backend module is still a stub. Once the admin cashback endpoints land (approve/reject pending cashback with audit), this page will manage them." />
      </Card>
    </div>
  );
}

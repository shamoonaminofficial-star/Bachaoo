'use client';
import React from 'react';
import { Card, EmptyState } from '@bachatly/ui';

export default function AdminVouchersPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold text-ink">Vouchers</h1>
      <Card className="p-4">
        <EmptyState title="Voucher admin is not live yet" icon="🎫"
          description="The vouchers backend module is still a stub. Once the admin voucher endpoints land (list, status, expiry management), vouchers will be managed here." />
      </Card>
    </div>
  );
}

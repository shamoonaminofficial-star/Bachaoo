'use client';
import React from 'react';
import { EmptyState } from '@bachatly/ui';

/**
 * Partner vouchers — there is no partner voucher-batch API as of Phase 8
 * (vouchers land fully in Phase 10). Honest placeholder; no fake batches.
 */
export default function PartnerVouchersPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold text-ink">Vouchers</h1>
      <EmptyState icon="🎫" title="Vouchers not live yet"
        description="Issue voucher batches for your business — fixed-amount or freebie codes customers can claim and redeem. This launches with the vouchers backend." />
    </div>
  );
}

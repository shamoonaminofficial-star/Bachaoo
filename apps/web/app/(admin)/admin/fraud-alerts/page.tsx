'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, Badge, DataTable, Skeleton, EmptyState, ErrorState } from '@bachatly/ui';
import { timeAgo } from '@/lib/format';
import { fetchFraudAlerts, type FraudAlert } from '@/lib/admin';

export default function FraudAlertsPage() {
  const [alerts, setAlerts] = useState<FraudAlert[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetchFraudAlerts().then(setAlerts).catch(() => setFailed(true));
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold text-ink">Fraud Alerts</h1>
        <p className="text-sm text-slate-500">
          Automated abuse signals from the platform. <strong>SUSPICIOUS_QR_RATE</strong> fires when a user mints
          more than 20 QR tokens per hour — flags are review-only and never block redemption automatically.
        </p>
      </div>
      <Card className="p-4">
        {failed ? (
          <ErrorState title="Could not load alerts" description="The GET /admin/fraud-alerts endpoint may not be deployed yet." onRetry={() => window.location.reload()} />
        ) : alerts === null ? (
          <Skeleton className="h-40" />
        ) : alerts.length === 0 ? (
          <EmptyState title="No fraud flags" description="Nothing suspicious detected. Alert feed is live." icon="🛡️" />
        ) : (
          <DataTable<FraudAlert> rows={alerts} exportName="fraud-alerts"
            columns={[
              { key: 'type', header: 'Signal', render: (r) => <Badge tone="error">{r.type}</Badge> },
              { key: 'userId', header: 'User', render: (r) => <Link href={`/admin/users?q=${r.userId}`} className="font-mono text-xs text-brand-700 hover:underline">{r.userId.slice(0, 8)}…</Link> },
              { key: 'mintAttemptsLastHour', header: 'QR mints / hour', sortable: true },
              { key: 'at', header: 'Flagged', render: (r) => timeAgo(r.at) },
            ]} />
        )}
      </Card>
    </div>
  );
}

'use client';
import React, { useEffect, useState } from 'react';
import { Card, Badge, Skeleton, EmptyState, ErrorState } from '@bachatly/ui';
import { fetchHealth, type HealthStatus } from '@/lib/admin';

function StatusCard({ label, ok, detail }: { label: string; ok: boolean | null; detail?: string }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <p className="font-bold text-ink">{label}</p>
        {ok === null ? <Badge tone="neutral">—</Badge> : ok ? <Badge tone="success">● Operational</Badge> : <Badge tone="error">● Down</Badge>}
      </div>
      {detail && <p className="mt-2 text-sm text-slate-500">{detail}</p>}
    </Card>
  );
}

export default function HealthPage() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetchHealth().then(setHealth).catch(() => setFailed(true));
  }, []);

  if (failed || health === null) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-extrabold text-ink">System Health</h1>
        {failed
          ? <ErrorState title="Health check is not live yet" description="The GET /admin/health endpoint is not deployed yet. Live database, Redis, storage and queue status will appear here once the backend Phase 9 health API lands." onRetry={() => window.location.reload()} />
          : <Skeleton className="h-48" />}
      </div>
    );
  }

  const queues = Object.entries(health.queues ?? {});

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold text-ink">System Health</h1>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatusCard label="PostgreSQL" ok={health.db.ok} detail={health.db.ok ? `Query latency ${health.db.latencyMs}ms` : 'Connection failed'} />
        <StatusCard label="Redis" ok={health.redis.ok} detail={health.redis.ok ? 'Connected' : 'Connection failed'} />
        <StatusCard label="Storage" ok={true} detail={`Backend: ${health.storage.backend}`} />
        <StatusCard label="Environment" ok={true} detail={health.env} />
      </div>
      <Card className="p-5">
        <h2 className="font-bold text-ink">Background queues</h2>
        {queues.length === 0
          ? <div className="mt-3"><EmptyState title="No queue data" description="Queue depths will appear here." /></div>
          : (
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {queues.map(([name, depth]) => (
                <div key={name} className="rounded-xl bg-slate-50 p-4">
                  <p className="text-xs text-slate-500">{name}</p>
                  <p className="text-xl font-extrabold text-ink">{depth}</p>
                </div>
              ))}
            </div>
          )}
      </Card>
    </div>
  );
}

'use client';
import React, { useEffect, useState } from 'react';
import { Card, EmptyState, Skeleton } from '@bachatly/ui';

export default function AdminReviewsPage() {
  const [notLive, setNotLive] = useState(false);

  useEffect(() => {
    // Reviews backend is still a contract-only stub; no moderation listing yet.
    setNotLive(true);
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold text-ink">Reviews</h1>
      <p className="text-sm text-slate-500">Moderation queue. Admin setting decides whether redemption is required before reviewing.</p>
      <Card className="p-4">
        {notLive ? (
          <EmptyState title="Review moderation is not live yet" description="The reviews module is still a backend stub. Once PATCH /reviews/:id/moderate lands, the moderation queue (approve / hide) will appear here." icon="⭐" />
        ) : (
          <Skeleton className="h-40" />
        )}
      </Card>
    </div>
  );
}

'use client';
import React from 'react';
import { Card, EmptyState } from '@bachatly/ui';

export default function CampaignsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold text-ink">Notification Campaigns</h1>
      <Card className="p-4">
        <EmptyState title="Campaigns are not live yet" icon="📣"
          description="There is no campaigns backend module yet. Once the campaign endpoints land (audience targeting, scheduling, send stats), this page will create and track campaigns." />
      </Card>
    </div>
  );
}

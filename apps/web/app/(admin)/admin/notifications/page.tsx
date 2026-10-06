'use client';
import React from 'react';
import { Card, EmptyState } from '@bachatly/ui';

export default function AdminNotificationsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold text-ink">Notifications</h1>
      <Card className="p-4">
        <EmptyState title="Notification admin is not live yet" icon="🔔"
          description="The notifications backend module is still a stub. Once the admin notification endpoints land (event log, channel status), the notification system will be managed here." />
      </Card>
    </div>
  );
}

'use client';
import React from 'react';
import { Card, EmptyState } from '@bachatly/ui';

export default function BannersPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold text-ink">Banners</h1>
      <Card className="p-4">
        <EmptyState title="Banners are not live yet" icon="🖼️"
          description="The banners backend module is still a stub. Once the banner endpoints land (CRUD with scheduling and priority), this page will manage promotional banners." />
      </Card>
    </div>
  );
}

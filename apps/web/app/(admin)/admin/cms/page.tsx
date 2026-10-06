'use client';
import React from 'react';
import { Card, EmptyState } from '@bachatly/ui';

export default function CmsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold text-ink">CMS</h1>
      <Card className="p-4">
        <EmptyState title="CMS is not live yet" icon="📄"
          description="The CMS backend module is still a stub. Once the CMS endpoints land (pages, slugs, publishing), content pages will be edited here." />
      </Card>
    </div>
  );
}

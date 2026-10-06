'use client';
import React from 'react';
import { Card, EmptyState } from '@bachatly/ui';

export default function AdminStaffPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold text-ink">Admin Staff</h1>
      <Card className="p-4">
        <EmptyState title="Admin staff management is not live yet" icon="🧑‍💼"
          description="There is no admin-staff backend module yet. Once the endpoints land (invite admins, assign admin roles, remove), this page will manage the admin team." />
      </Card>
    </div>
  );
}

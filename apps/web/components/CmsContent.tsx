'use client';
import React, { useEffect, useState } from 'react';
import { Card, Skeleton } from '@bachatly/ui';
import { fetchCmsPage, type CmsPage } from '@/lib/engagement';

/**
 * Render a CMS-managed page (Phase 11). Fetches `GET /cms/:slug`; when the
 * slug isn't live yet the static `fallback` content is shown instead.
 *
 * Note: CMS body HTML is authored by trusted admins. A light client-side
 * sanitizer strips <script>/<iframe> and event-handler attributes before render.
 */
function sanitize(html: string): string {
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('script, iframe, object, embed, style').forEach((el) => el.remove());
    doc.querySelectorAll('*').forEach((el) => {
      [...el.attributes].forEach((a) => {
        if (a.name.toLowerCase().startsWith('on') || a.name.toLowerCase() === 'srcdoc') {
          el.removeAttribute(a.name);
        }
      });
    });
    return doc.body.innerHTML;
  } catch {
    return '';
  }
}

export default function CmsContent({ slug, fallback }: { slug: string; fallback: React.ReactNode }) {
  const [page, setPage] = useState<CmsPage | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let live = true;
    fetchCmsPage(slug)
      .then((p) => { if (live) setPage(p); })
      .catch(() => {})
      .finally(() => { if (live) setReady(true); });
    return () => { live = false; };
  }, [slug]);

  if (!ready) {
    return (
      <>
        <Skeleton className="mt-3 h-9 w-2/3 !rounded-xl" />
        <Card className="mt-4 p-6"><Skeleton className="h-40 w-full" /></Card>
      </>
    );
  }

  if (page) {
    return (
      <>
        <h1 className="mt-3 text-3xl font-extrabold text-ink">{page.title}</h1>
        {page.updatedAt && (
          <p className="mt-1 text-xs text-slate-400">
            Last updated {new Date(page.updatedAt).toLocaleDateString('en-PK')}
          </p>
        )}
        <Card className="mt-4 p-6">
          <div
            className="space-y-3 text-sm leading-relaxed text-slate-600 [&_a]:text-brand-700 [&_a]:underline [&_h2]:pt-2 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-ink [&_h3]:text-base [&_h3]:font-bold [&_h3]:text-ink [&_li]:ml-4 [&_li]:list-disc [&_p]:text-sm [&_strong]:text-ink"
            dangerouslySetInnerHTML={{ __html: sanitize(page.body) }}
          />
        </Card>
      </>
    );
  }

  return <>{fallback}</>;
}

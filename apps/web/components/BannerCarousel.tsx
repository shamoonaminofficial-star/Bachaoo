'use client';
'use client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { fetchActiveBanners, type CmsBanner } from '@/lib/engagement';

const ROTATE_MS = 5000;

/**
 * Homepage hero carousel (Phase 11) — active CMS banners, auto-rotating
 * with dots and arrows. Renders nothing while loading or when no banners
 * are configured.
 *
 * A11y: region with carousel roledescription, arrow-key navigation, Escape
 * stops auto-rotation, controls are siblings of the slide link (no nested
 * interactives), auto-rotation pauses on hover AND on focus within.
 */
export default function BannerCarousel() {
  const [banners, setBanners] = useState<CmsBanner[] | null>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let live = true;
    fetchActiveBanners()
      .then((b) => { if (live) setBanners(b && b.length > 0 ? [...b].sort((x, y) => (x.priority ?? 0) - (y.priority ?? 0)) : null); })
      .catch(() => { if (live) setBanners(null); });
    return () => { live = false; };
  }, []);

  const restart = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => setIndex((i) => i + 1), ROTATE_MS);
  }, []);

  useEffect(() => {
    if (!banners || banners.length < 2 || paused) return;
    // Respect users who prefer reduced motion: no auto-rotation.
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    restart();
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [banners, paused, restart]);

  if (banners === null) return null;

  const current = banners[index % banners.length];
  const active = index % banners.length;
  const go = (i: number) => { setIndex((i + banners.length) % banners.length); restart(); };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') { go(active - 1); }
    else if (e.key === 'ArrowRight') { go(active + 1); }
    else if (e.key === 'Escape') { setPaused(true); }
  };

  const slide = (
    <div className="relative overflow-hidden rounded-3xl bg-ink shadow-card">
      {current.image ? (
        <div className="relative h-44 w-full sm:h-56">
          <Image src={current.image} alt={current.title} fill priority={active === 0} sizes="100vw" className="object-cover" />
        </div>
      ) : (
        <div className="flex h-44 items-center justify-center bg-gradient-to-r from-brand-700 to-brand-500 sm:h-56">
          <p className="px-6 text-center text-2xl font-extrabold text-white sm:text-3xl">{current.title}</p>
        </div>
      )}
      {current.image && (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/80 to-transparent p-4">
          <p className="text-lg font-extrabold text-white">{current.title}</p>
        </div>
      )}
    </div>
  );

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Announcements"
      onKeyDown={onKeyDown}
      onMouseEnter={() => timer.current && clearInterval(timer.current)}
      onMouseLeave={restart}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="relative"
    >
      {current.link ? (
        <Link href={current.link} aria-label={`${current.title} — view details`}>{slide}</Link>
      ) : slide}
      {banners.length > 1 && (
        <>
          <button
            aria-label="Previous banner"
            onClick={() => go(active - 1)}
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-ink/50 p-2 text-white hover:bg-ink/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          ><span aria-hidden>‹</span></button>
          <button
            aria-label="Next banner"
            onClick={() => go(active + 1)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-ink/50 p-2 text-white hover:bg-ink/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          ><span aria-hidden>›</span></button>
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5" role="group" aria-label="Choose banner">
            {banners.map((b, i) => (
              <button key={b.id} aria-label={`Banner ${i + 1}: ${b.title}`} aria-current={i === active ? 'true' : undefined}
                onClick={() => go(i)}
                className={`h-2 rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${i === active ? 'w-6 bg-white' : 'w-2 bg-white/50'}`} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

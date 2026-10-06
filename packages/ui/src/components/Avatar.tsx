import React from 'react';

export function Avatar({ name, src, size = 'md' }: { name: string; src?: string; size?: 'sm' | 'md' | 'lg' }) {
  const sz = size === 'sm' ? 'h-8 w-8 text-xs' : size === 'lg' ? 'h-14 w-14 text-lg' : 'h-10 w-10 text-sm';
  const initials = name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  if (src) return <img src={src} alt={name} className={`${sz} rounded-full object-cover`} />;
  return (
    <div className={`${sz} flex shrink-0 items-center justify-center rounded-full bg-brand-100 font-bold text-brand-700`} aria-label={name}>
      {initials}
    </div>
  );
}

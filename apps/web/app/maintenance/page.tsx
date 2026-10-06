import { Button } from '@bachatly/ui';
import Link from 'next/link';
export const metadata = { title: 'Maintenance' };
export default function Maintenance() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100 text-3xl" aria-hidden>🔧</div>
      <h1 className="mt-4 text-2xl font-bold text-ink">We'll be right back</h1>
      <p className="mt-2 max-w-sm text-slate-500">Bachatly is undergoing scheduled maintenance. Please check back shortly.</p>
      <Link href="/" className="mt-6"><Button variant="outline">Refresh</Button></Link>
    </div>
  );
}

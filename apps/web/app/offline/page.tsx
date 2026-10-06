import { Button } from '@bachatly/ui';
import Link from 'next/link';
export const metadata = { title: 'You are offline' };
export default function Offline() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-200 text-3xl" aria-hidden>📡</div>
      <h1 className="mt-4 text-2xl font-bold text-ink">You're offline</h1>
      <p className="mt-2 max-w-sm text-slate-500">Check your internet connection and try again.</p>
      <Link href="/" className="mt-6"><Button>Retry</Button></Link>
    </div>
  );
}

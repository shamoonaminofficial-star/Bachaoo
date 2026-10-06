import Link from 'next/link';
import { Button } from '@bachatly/ui';

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
      <p className="text-7xl font-extrabold text-brand-600">404</p>
      <h1 className="mt-4 text-2xl font-bold text-ink">Page not found</h1>
      <p className="mt-2 max-w-sm text-slate-500">The page you are looking for has moved or never existed. Let's get you back to the savings.</p>
      <div className="mt-6 flex gap-3">
        <Link href="/"><Button>Back to Home</Button></Link>
        <Link href="/deals"><Button variant="outline">Explore Deals</Button></Link>
      </div>
    </div>
  );
}

import Link from 'next/link';
import { Button, Card } from '@bachatly/ui';

export const metadata = { title: 'Not Authorized' };

export default function ForbiddenPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <Card className="w-full max-w-md p-8 text-center">
        <span className="text-5xl" aria-hidden>
          🔒
        </span>
        <h1 className="mt-3 text-2xl font-extrabold text-ink">Not authorized</h1>
        <p className="mt-2 text-sm text-slate-500">
          Your account doesn&apos;t have access to this area. If you believe this is a
          mistake, please contact support.
        </p>
        <div className="mt-6 flex gap-2">
          <Link href="/" className="flex-1">
            <Button variant="outline" fullWidth>
              Go Home
            </Button>
          </Link>
          <Link href="/contact" className="flex-1">
            <Button fullWidth>Contact Support</Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}

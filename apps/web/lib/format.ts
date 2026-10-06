/** Formatting helpers. Currency: PKR ("Rs. 5,000"). Timezone: Asia/Karachi. */

export function formatPKR(amount: number): string {
  return 'Rs. ' + Math.round(amount).toLocaleString('en-PK');
}

export function formatPKRCompact(amount: number): string {
  if (amount >= 1_000_000) return `Rs. ${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `Rs. ${(amount / 1_000).toFixed(1)}k`;
  return formatPKR(amount);
}

const TZ = 'Asia/Karachi';

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-PK', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric' });
}
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-PK', { timeZone: TZ, day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}
export function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
export function formatDistance(km?: number): string {
  if (km === undefined) return '';
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}
export function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
}

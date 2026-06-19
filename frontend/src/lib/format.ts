import type { StatusKey } from '../types/portfolio';

export const STATUS_META: Record<
  StatusKey,
  { label: string; color: string; bg: string; ring: string }
> = {
  red: { label: 'EXIT / STOP BREACHED', color: '#ef4444', bg: 'rgba(239,68,68,0.15)', ring: 'rgba(239,68,68,0.5)' },
  orange_hot: { label: 'T1 IMMINENT', color: '#f97316', bg: 'rgba(249,115,22,0.15)', ring: 'rgba(249,115,22,0.5)' },
  yellow: { label: 'HOLD / WATCH', color: '#eab308', bg: 'rgba(234,179,8,0.15)', ring: 'rgba(234,179,8,0.5)' },
  green: { label: 'LIMIT SELL NOW', color: '#22c55e', bg: 'rgba(34,197,94,0.15)', ring: 'rgba(34,197,94,0.5)' },
  purple: { label: 'ILLIQUID / SPECIAL', color: '#a855f7', bg: 'rgba(168,85,247,0.15)', ring: 'rgba(168,85,247,0.5)' },
};

export function statusDot(key: StatusKey): string {
  return STATUS_META[key]?.color ?? '#94a3b8';
}

export function fmtNum(n: number | null | undefined, dp = 2): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

export function fmtEgp(n: number | null | undefined, dp = 2): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${fmtNum(n, dp)} EGP`;
}

export function fmtPct(n: number | null | undefined, dp = 2): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${fmtNum(n, dp)}%`;
}

export function timeAgo(iso: string | null): string {
  if (!iso) return 'never';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'unknown';
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (secs < 10) return 'just now';
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function daysUntil(iso: string): number {
  const target = new Date(iso).getTime();
  return Math.ceil((target - Date.now()) / 86400000);
}

export function dailyPct(s: string | null): number | null {
  if (!s) return null;
  const m = s.match(/\(([-+]?\d+\.?\d*)%\)/);
  return m ? parseFloat(m[1]) : null;
}

export function fmtNewsTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

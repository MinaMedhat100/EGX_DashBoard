import { useEffect, useState } from 'react';
import { nextThndrWindow } from '../../lib/gold';

export function ThndrWindowChip() {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 60000); // refresh the countdown each minute
    return () => clearInterval(id);
  }, []);
  const { label, minsUntil } = nextThndrWindow();
  const h = Math.floor(minsUntil / 60);
  const m = minsUntil % 60;
  return (
    <span
      title="Thndr gold execution windows: 10:00 · 13:00 · 15:00 Cairo"
      className="text-[11px] rounded-lg px-2.5 py-1 bg-surface border border-border text-txt-secondary"
    >
      ⏰ Next Thndr window {label} · in {h > 0 ? `${h}h ` : ''}{m}m
    </span>
  );
}

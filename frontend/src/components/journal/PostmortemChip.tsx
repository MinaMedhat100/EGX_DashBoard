import type { PostmortemSummaryItem } from '../../types/portfolio';
import { chipText, TONE_CLASS } from '../../lib/postmortem';

export function PostmortemChip({ item, onAnalyse }: { item?: PostmortemSummaryItem; onAnalyse: () => void }) {
  if (!item) return null;
  const chip = chipText(item);
  if (!chip) {
    return <button onClick={onAnalyse} className="text-[11px] text-accent-purple-lt hover:text-txt-primary whitespace-nowrap">Analyse this trade</button>;
  }
  return <span className={`text-[11px] px-1.5 rounded border whitespace-nowrap ${TONE_CLASS[chip.tone]}`}>{chip.text}</span>;
}

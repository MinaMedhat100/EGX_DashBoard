import { useState } from 'react';
import { api } from '../../api/client';
import type { JournalNote } from '../../types/portfolio';

export function NoteField({ tradeId, note, onSaved }: { tradeId: string; note?: JournalNote; onSaved: (n: JournalNote | null) => void }) {
  const [text, setText] = useState(note?.text ?? '');
  const [state, setState] = useState<'idle' | 'saving' | 'error'>('idle');
  const save = async () => {
    if (text.trim() === (note?.text ?? '')) return;
    setState('saving');
    try { onSaved((await api.saveJournalNote(tradeId, text)).note); setState('idle'); }
    catch { setState('error'); }
  };
  return (
    <div className="flex items-center gap-2">
      <span className="text-txt-secondary">Your note:</span>
      <input
        value={text} maxLength={280} placeholder="why — e.g. stop wasn't active on ThndrX"
        onChange={(e) => setText(e.target.value)} onBlur={save} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        className="flex-1 bg-transparent border-b border-border focus:border-accent-purple-lt outline-none px-1"
      />
      {state === 'saving' && <span className="text-txt-secondary">saving…</span>}
      {state === 'error' && <span className="text-status-red">not saved</span>}
    </div>
  );
}

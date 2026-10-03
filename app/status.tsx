'use client';
// One place for state (design 1g). Everything transient appears in a single card floating just above Söyle;
// it never pushes the page. Being offline is the one lasting state: a thin strip at the top of the page.
import {AlertTriangle, Check, HelpCircle, WifiOff, X} from 'lucide-react';
import {type Dictation} from '@/lib/domain';

export type NoticeBody =
  | {kind: 'done'; title: string; text: string; changeId?: string}
  | {kind: 'question'; dictation: Dictation; question: string; choices: string[]};
export type Notice = NoticeBody & {id: number};

type Props = {
  notice: Notice | null; error: string; online: boolean; processing: boolean; queued: number; busy: boolean;
  see: () => void; undo: (changeId: string) => void; retry: () => void; dismiss: () => void; clearError: () => void;
  reply: (d: Dictation, text: string) => void; write: (d: Dictation) => void;
};

/** Which card shows when several apply: an error, then Berthier's question, a result, work in progress, the device queue. */
export function StatusCard({notice, error, online, processing, queued, busy, see, undo, retry, dismiss, clearError, reply, write}: Props) {
  if (error) return <div className="status-card is-error" role="alert">
    <span className="status-icon"><AlertTriangle size={18}/></span>
    <p><strong>İşlenemedi.</strong> {error}</p>
    <button className="status-action" disabled={busy || !online} onClick={retry}>Tekrar dene</button>
    <button className="status-close" aria-label="Kapat" onClick={clearError}><X size={16}/></button>
  </div>;
  if (notice?.kind === 'question') return <div className="status-card is-question" role="status">
    <div className="status-line">
      <span className="status-icon"><HelpCircle size={18}/></span>
      <p><strong>Berthier soruyor:</strong> {notice.question}</p>
      <button className="status-close" aria-label="Sonra yanıtla" onClick={dismiss}><X size={16}/></button>
    </div>
    <div className="status-choices">
      {notice.choices.map(c => <button key={c} disabled={busy} onClick={() => reply(notice.dictation, c)}>{c}</button>)}
      <button onClick={() => write(notice.dictation)}>{notice.choices.length ? 'Yazıyla' : 'Yanıtla'}</button>
    </div>
  </div>;
  if (notice?.kind === 'done') return <div className="status-card is-done" role="status">
    <span className="status-icon"><Check size={18} strokeWidth={2.4}/></span>
    <p><strong>{notice.title}</strong>{notice.text && ' ' + notice.text}</p>
    <button className="status-action" onClick={see}>Gör</button>
    {notice.changeId && <button className="status-action is-plain" disabled={busy || !online} onClick={() => undo(notice.changeId!)}>Geri al</button>}
  </div>;
  if (processing && online) return <div className="status-card" role="status">
    <span className="status-icon"><span className="status-spin"/></span>
    <p><strong>Berthier yerleştiriyor…</strong> Dikten kayıtlı; beklemene gerek yok.</p>
  </div>;
  if (!online && queued) return <div className="status-card" role="status">
    <span className="status-icon"><WifiOff size={18}/></span>
    <p><strong>Çevrimdışı.</strong> {queued} dikte cihazda; bağlantı gelince kaydedilir.</p>
    <button className="status-action" onClick={see}>Ayrıntı</button>
  </div>;
  return null;
}

/** “Çevrimdışı · 10:12’deki kayıt gösteriliyor” and, on the right, how many entries wait on the device. */
export function OfflineStrip({saved, queued}: {saved: string; queued: number}) {
  return <div className="offline-strip" role="status">
    <WifiOff size={16}/>
    <span>Çevrimdışı · {saved} gösteriliyor</span>
    {queued > 0 && <span className="offline-count">{queued} BEKLİYOR</span>}
  </div>;
}

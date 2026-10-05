'use client';
// One place for state (design 1g). Everything transient appears in a single card floating just above Söyle;
// it never pushes the page. Being offline is the one lasting state: a thin strip at the top of the page.
// Rutinler (4 Ekim, K10) adds two states to the same card: a running timer and the in-app reminder. Which
// card shows: an error › Berthier's question › a result (8 s; a receipt with a choice 12 s) › the timer › the
// reminder › work in progress › the device queue.
import {useEffect, useState} from 'react';
import {AlertTriangle, Check, HelpCircle, Play, Repeat, WifiOff, X} from 'lucide-react';
import {type Dictation} from '@/lib/domain';
import {KIND_TAG, type Placement} from '@/lib/kinds';
import {clock, type Reminder, type RunningInfo} from '@/lib/routines';
import {sinceTime} from '@/lib/turkish';

export type ReceiptLine = Placement & {changeId?: string};
export type NoticeBody =
  | {kind: 'done'; title: string; text: string; changeId?: string; lines?: ReceiptLine[]; sourceId?: string; fix?: string}
  | {kind: 'question'; dictation: Dictation; question: string; choices: string[]};
export type Notice = NoticeBody & {id: number};

type Props = {
  notice: Notice | null; error: string; online: boolean; processing: boolean; queued: number; busy: boolean;
  see: () => void; undo: (changeId: string) => void; retry: () => void; dismiss: () => void; clearError: () => void;
  reply: (d: Dictation, text: string) => void; write: (d: Dictation) => void;
  running: RunningInfo | null; reminder: Reminder | null;
  finish: () => void; fixEnd: () => void; fix: (sessionId: string) => void;
  start: (r: Reminder) => void; skip: (r: Reminder) => void; hide: (key: string) => void;
  /** A receipt line's second guess; a move becoming a routine asks “haftada kaç?” first. */
  alt: (line: ReceiptLine, sourceId: string, count?: number) => void; keep: () => void;
};

const COUNTS: [number, string][] = [[1, '1'], [2, '2'], [3, '3'], [4, '4'], [7, 'Her gün']];

/** “12:41”, ticking every second from the timer's start. */
function Elapsed({start}: {start: string}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const s = Math.max(0, Math.floor((now - Date.parse(start)) / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return <span className="status-clock" aria-hidden="true">{h ? `${h}:${pad(m)}:${pad(r)}` : `${pad(m)}:${pad(r)}`}</span>;
}

export function StatusCard(props: Props) {
  const {notice, error, online, processing, queued, busy, see, undo, retry, dismiss, clearError, reply, write, running, reminder, finish, fixEnd, fix, start, skip, hide, alt, keep} = props;
  const [asking, setAsking] = useState<string | null>(null), off = busy || !online;
  if (error) return <div className="status-card is-error" role="alert">
    <span className="status-icon"><AlertTriangle size={18}/></span>
    <p><strong>İşlenemedi.</strong> {error}</p>
    <button className="status-action" disabled={off} onClick={retry}>Tekrar dene</button>
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
  // K8 · the receipt: each placed item with its kind; the one with a second guess comes first; at most three.
  if (notice?.kind === 'done' && notice.lines?.length) {
    const lines = [...notice.lines].sort((a, b) => Number(!!b.alt) - Number(!!a.alt)).slice(0, 3);
    return <div className="status-card is-done is-receipt" role="status">
      <div className="status-line">
        <span className="status-icon"><Check size={18} strokeWidth={2.4}/></span>
        <p><strong>{notice.title}</strong>{notice.text && ' ' + notice.text}</p>
        {(notice.changeId || notice.lines.length > 3) && <button className="status-action" onClick={see}>Gör</button>}
        {notice.changeId && <button className="status-action is-plain" disabled={off} onClick={() => undo(notice.changeId!)}>Geri al</button>}
      </div>
      {lines.map(line => <div className="receipt-row" key={line.ref}>
        <span className="receipt-kind">{KIND_TAG[line.kind]}</span>
        <span className="receipt-text">{line.text}<small>{line.note}</small>
          {line.alt && notice.sourceId && (asking === line.ref
            ? <span className="receipt-count"><span>Haftada kaç?</span>{COUNTS.map(([n, label]) => <button key={n} className="receipt-alt" disabled={off} onClick={() => { setAsking(null); alt(line, notice.sourceId!, n); }}>{label}</button>)}</span>
            : <button className="receipt-alt" disabled={off} onClick={() => { if (line.alt!.to === 'routine') { keep(); setAsking(line.ref); } else alt(line, notice.sourceId!); }}>{line.alt.label}</button>)}
        </span>
      </div>)}
    </div>;
  }
  if (notice?.kind === 'done') return <div className="status-card is-done" role="status">
    <span className="status-icon"><Check size={18} strokeWidth={2.4}/></span>
    <p><strong>{notice.title}</strong>{notice.text && ' ' + notice.text}</p>
    {notice.fix ? <button className="status-action" disabled={off} onClick={() => fix(notice.fix!)}>Düzelt</button> : <button className="status-action" onClick={see}>Gör</button>}
    {notice.changeId && <button className="status-action is-plain" disabled={off} onClick={() => undo(notice.changeId!)}>Geri al</button>}
  </div>;
  // A5 · the running timer stays on every tab; at twice the usual length it asks.
  if (running) {
    const since = sinceTime(clock(running.start)) + ' beri', title = running.routine.title + (running.step ? ' · ' + running.step.title.toLocaleLowerCase('tr-TR') : '');
    if (running.overdue) return <div className="status-card is-question is-running" role="status">
      <div className="status-line"><span className="status-icon"><i className="rt-pulse"/></span><p><strong>{title} hâlâ sürüyor mu?</strong> {since}.</p></div>
      <div className="status-choices"><button className="is-gold" disabled={off} onClick={finish}>Bitti</button><button disabled={off} onClick={fixEnd}>Bitişi düzelt</button></div>
    </div>;
    return <div className="status-card is-running" role="status">
      <span className="status-icon"><i className="rt-pulse"/></span>
      <p><strong>{title}</strong> · {since}</p>
      <Elapsed start={running.start}/>
      <button className="status-action" disabled={off} onClick={finish}>Bitti</button>
    </div>;
  }
  // B2 · the reminder while the app is open: the question card's layout; × hides it for today only.
  if (reminder) return <div className="status-card is-question is-routine" role="status">
    <div className="status-line">
      <span className="status-icon"><Repeat size={18}/></span>
      <p><strong>{reminder.title}</strong> {reminder.body}</p>
      <button className="status-close" aria-label="Bugün gösterme" onClick={() => hide(reminder.key)}><X size={16}/></button>
    </div>
    {reminder.words && <p className="status-words">{reminder.words}</p>}
    <div className="status-choices">
      <button className="is-gold" disabled={off} onClick={() => start(reminder)}>{reminder.timer ? <><Play size={14}/>Başlat</> : 'Yaptım'}</button>
      <button disabled={off} onClick={() => skip(reminder)}>Bugün değil</button>
    </div>
  </div>;
  if (processing && online) return <div className="status-card" role="status">
    <span className="status-icon"><span className="status-spin"/></span>
    <p><strong>Berthier yerleştiriyor…</strong> Dikten kayıtlı; beklemene gerek yok.</p>
  </div>;
  if (!online && queued) return <div className="status-card" role="status">
    <span className="status-icon"><WifiOff size={18}/></span>
    <p><strong>Çevrimdışı.</strong> {queued} girdi cihazda; bağlantı gelince kaydedilir.</p>
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

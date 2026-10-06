'use client';
// Sabah raporu: the same four sections every day (lib/report.ts), with the order approved from a fixed
// bar at the bottom. Every action reuses an existing flow: the reorder and front-selection dialogs, the
// conflict mail and item dialogs, the answer queue and the change log's undo.
import {Fragment, useEffect, useEffectEvent, useRef, useState} from 'react';
import {ArrowDownUp, ArrowLeft, Check, ChevronRight} from 'lucide-react';
import {type CalendarEvent} from '@/lib/calendar';
import {type Dictation, type Order, type State, isOpen} from '@/lib/domain';
import {clockText} from '@/lib/expedition/camps';
import {buildReport, type QueuedReply} from '@/lib/report';
import {useReorder} from './atlas-order';
import {ConflictMailDialog, EventDialog} from './horizon';

type Options = {quiet?: boolean; silent?: boolean};
type Action = (body: {kind: string; [key: string]: unknown}, options?: Options) => Promise<boolean | undefined>;
type Props = {
  state: State; dictations: Dictation[]; outbox: QueuedReply[]; now: number; online: boolean; busy: boolean;
  action: Action; select: () => void; answer: (d: Dictation) => void; reply: (d: Dictation, text: string) => void;
  back: () => void; opened: () => void;
};

const SECTIONS = [['I', 'Emir'], ['II', 'Uyarı'], ['III', 'Yer'], ['IV', 'Karar']] as const;

export default function MorningReport({state, dictations, outbox, now, online, busy, action, select, answer, reply, back, opened}: Props) {
  const report = buildReport(state, dictations, outbox, new Date(now));
  const [editing, setEditing] = useState<CalendarEvent | null>(null), [mailId, setMailId] = useState<string | null>(null);
  const index = useRef<HTMLElement>(null);
  const reorder = useReorder({state, order: report.order, busy, online, action});

  // The first opening of the day dates the report and starts the expedition (reportOpen is idempotent).
  const recorded = !!state.metrics?.reportOpenedAt?.[report.day];
  const record = useEffectEvent(() => opened());
  useEffect(() => { if (online && !recorded) record(); }, [online, recorded]);

  function go(i: number) {
    const el = document.getElementById('mr-section-' + i);
    if (!el) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Leave the sticky index's height and a little air above the section, as the design does (76 px).
    window.scrollTo({top: el.getBoundingClientRect().top + window.scrollY - (index.current?.offsetHeight ?? 71) - 5, behavior: reduced ? 'auto' : 'smooth'});
  }

  const [orders, warns, places, decisions] = report.counts, off = !online || busy;
  const approved = report.order.approvedAt;
  // “Geri al” after approval undoes exactly the change that approved today's order.
  const approval = approved ? [...state.changes].reverse().find(c => c.ops.some(o => !o.undone && o.key === 'order:' + report.day && !!(o.after as Order | null)?.approvedAt && !(o.before as Order | null)?.approvedAt)) : undefined;
  // Kaldır (5 Ekim): a row's open move leaves its front's queue; the front's next move takes its place.
  const openMove = (frontId: string) => { const slot = report.order.slots.find(x => x.frontId === frontId), m = slot && !slot.doneAt ? state.fronts[frontId]?.moves.find(x => x.id === slot.moveId) : undefined; return m && isOpen(m) ? m : undefined; };
  const mailConflict = report.warnings.find(w => w.id === mailId)?.conflict ?? report.drafts.find(d => d.conflict.id === mailId)?.conflict;

  return <div className="morning-report">
    {/* Offline, the app's strip above says which record is shown; the approval bar says why it waits. */}
    <header className="mr-head">
      <button className="mr-back" onClick={back}><ArrowLeft size={16}/>Karargâh</button>
      <h1>Sabah raporu</h1>
      <p>{report.header}</p>
    </header>
    <nav className="mr-index" ref={index} aria-label="Raporun bölümleri">
      {SECTIONS.map(([num, name], i) => <button key={num} onClick={() => go(i)}><span>{num}</span><span>{name} {report.counts[i] || 'yok'}</span></button>)}
    </nav>

    <div className="mr-body">
      <section id="mr-section-0" className="mr-section" aria-labelledby="mr-s1">
        <h2 id="mr-s1"><span>I</span><span>GÜNÜN EMRİ</span><span>{orders ? `${orders} CEPHE` : 'CEPHE YOK'}</span></h2>
        {orders ? <>
          <div className="mr-strip" aria-hidden="true">
            <span className="mr-hq">✳</span>
            {report.rows.map(r => <Fragment key={r.frontId}><span className="mr-dots"/><span className={`mr-node is-${r.tone}`}>{r.num}</span></Fragment>)}
          </div>
          <p className="mr-path">{report.path}</p>
          {report.rows.map(r => <div className={r.tone === 'done' ? 'mr-row is-done' : 'mr-row'} key={r.frontId}>
            <span className="mr-num">{r.num}</span>
            <div className="mr-row-body"><span className="mr-row-head">{r.head}</span><span className="mr-move">{r.move}</span><span className="mr-why">↳ {r.why}</span></div>
            <span className="mr-side"><span className={`mr-chip is-${r.tone}`}>{r.tone === 'done' ? 'GEÇİLDİ' : r.chip}</span>
              {openMove(r.frontId) && <button className="mr-remove" aria-label={`Kaldır: ${r.move}`} disabled={off} onClick={() => action({kind: 'removeMove', frontId: r.frontId, moveId: openMove(r.frontId)!.id})}>Kaldır</button>}</span>
          </div>)}
          <div className="mr-links">
            {orders > 1 && <button className="text-button" disabled={busy} onClick={reorder.begin}><ArrowDownUp size={16}/>Sırayı düzenle</button>}
            <button className="text-button" disabled={busy} onClick={select}>Cephe ekle / çıkar</button>
          </div>
        </> : <div className="mr-empty">
          <p>Bugün için önerilen cephe yok.</p><p className="mr-muted">İstersen bir cephe ekleyebilirsin.</p>
          <button className="text-button" disabled={busy} onClick={select}>Cephe ekle</button>
        </div>}
      </section>

      <section id="mr-section-1" className="mr-section" aria-labelledby="mr-s2">
        <h2 id="mr-s2"><span>II</span><span>UYARILAR</span><span>{warns || 'YOK'}</span></h2>
        {report.warnings.map(w => <article key={w.id} className={w.seen ? 'mr-card mr-warning is-seen' : 'mr-card mr-warning'}>
          <div className="mr-card-top"><span>{w.label}</span><span>{w.meta}</span></div>
          <p>{w.text}</p>
          <div className="mr-card-actions">
            <button disabled={off} onClick={() => { if (w.conflict) setMailId(w.id); else if (w.event) setEditing({...w.event}); }}>{w.action}</button>
            <button disabled={off} onClick={() => action(w.kind === 'conflict' ? {kind: 'seenConflict', conflictId: w.id, seen: !w.seen} : {kind: 'seenWarning', warningId: w.id, seen: !w.seen}, {silent: true})}>{w.seen ? 'Geri al' : 'Görüldü'}</button>
          </div>
        </article>)}
        {!warns && <p className="mr-none">Uyarı yok.</p>}
      </section>

      <section id="mr-section-2" className="mr-section" aria-labelledby="mr-s3">
        <h2 id="mr-s3" className="is-tight"><span>III</span><span>BUGÜN VE YARIN</span><span>{places ? `${places} YER` : 'YOK'}</span></h2>
        {report.days.map(d => d.places.length ? d.places.map(p => <div className="mr-place" key={p.when + p.event.id}>
          <span className="mr-when">{p.when}</span>
          <h3>{p.title}</h3>
          {p.context && <span className="mr-context">{p.context}</span>}
          {p.bring && <p className="mr-bring"><span>YANINA AL</span>{p.bring}</p>}
        </div>) : <div className="mr-place" key={d.when}><span className="mr-when">{d.when}</span><span className="mr-none">Olunacak yer yok.</span></div>)}
      </section>

      <section id="mr-section-3" className="mr-section" aria-labelledby="mr-s4">
        <h2 id="mr-s4"><span>IV</span><span>KARARINI BEKLEYENLER</span><span>{decisions || 'YOK'}</span></h2>
        {report.questions.map(q => <article key={q.dictation.id} className="mr-card mr-question">
          <span className="mr-card-label">{q.label}</span>
          <p className="mr-card-title">{q.question}</p>
          {q.answer
            ? <div className="mr-answered">
              <span><Check size={16}/>Yanıtın kaydedildi: {q.answer.text}</span>
              {q.answer.change && <button className="text-button" disabled={off} onClick={() => action({kind: 'undo', changeId: q.answer!.change!.id}, {silent: true})}>Geri al</button>}
            </div>
            : <div className="mr-options">
              {q.choices.map(c => <button key={c} disabled={off} onClick={() => reply(q.dictation, c)}>{c}</button>)}
              <button disabled={off} onClick={() => answer(q.dictation)}>{q.choices.length ? 'Yazıyla yanıtla' : 'Yanıtla'}</button>
            </div>}
        </article>)}
        {report.drafts.map(d => <article key={d.conflict.id} className="mr-card mr-draft">
          <span className="mr-card-label">{d.label}</span>
          <p className="mr-card-title">{d.text}</p>
          <p className="mr-card-note">Gönderen sensin; Berthier göndermez.</p>
          <div><button className="text-button" onClick={() => setMailId(d.conflict.id)}>Taslağı aç<ChevronRight size={16}/></button></div>
        </article>)}
        {!decisions && <p className="mr-none">Kararını bekleyen bir şey yok.</p>}
      </section>
      <p className="mr-end">{report.next}</p>
    </div>

    <div className="mr-bar">
      {orders > 0 && !approved && <button className="mr-approve btn-main" disabled={off} onClick={() => action({kind: 'approve'}, {silent: true})}><span>Emri onayla</span><span>{orders} CEPHE</span></button>}
      {orders > 0 && approved && <div className="mr-approved">
        <span><Check size={18}/>Onaylandı · {clockText(approved)}</span>
        <button className="text-button" disabled={off || !approval} onClick={() => approval && action({kind: 'undo', changeId: approval.id}, {silent: true})}>Geri al</button>
        <button className="mr-home" onClick={back}>Karargâh’a git</button>
      </div>}
      {!orders && <button className="mr-approve is-center btn-quiet" onClick={back}>Karargâh’a dön</button>}
      {!online && orders > 0 && !approved && <p className="mr-offline-note">Onay için bağlantı gerekiyor. Diktelerin cihazda saklanır.</p>}
    </div>

    <EventDialog state={state} busy={busy} action={action} editing={editing} setEditing={setEditing}/>
    <ConflictMailDialog state={state} busy={busy} action={action} conflict={mailConflict} close={() => setMailId(null)}/>
    {reorder.dialog}
  </div>;
}

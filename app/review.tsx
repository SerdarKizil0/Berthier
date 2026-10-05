'use client';
// Haftalık teftiş as a full-screen flow (design 1j): no tab bar, named steps, one card per stale front with
// three one-tap decisions saved at once, and a single main action that names the next step. Every decision
// goes through the existing commands and lands in the change log; leaving keeps the step (review.step).
// K9 (4 Ekim): six steps, BAYAT · DEPO · PROJE · UFUK · RUTİN · ÖZET; with no routine the RUTİN step is skipped.
import {useState} from 'react';
import {ArrowRight, Check, ChevronRight, X} from 'lucide-react';
import {Checkbox} from '@/components/ui/checkbox';
import {nextMove, type Front, type State} from '@/lib/domain';
import {laneSuggestion} from '@/lib/research';
import {ROUTINE_STEP, horizonBrief, reviewFronts, reviewSteps, stepPosition, type Decision} from '@/lib/book';
import {dayKey} from '@/lib/domain';
import {proposals, reviewRows, slideSuggestions} from '@/lib/routines';
import {andList} from '@/lib/turkish';
import Research from './research';
import {LogSheet, ScaffoldCard, TrialCard} from './routines';

type Action = (body: {kind: string; [key: string]: unknown}, options?: {quiet?: boolean; silent?: boolean}) => Promise<boolean | undefined>;
type Props = {state: State; now: number; busy: boolean; online: boolean; why: string; action: Action; close: () => void; horizon: () => void; pattern: () => void};

const TYPE: Record<Front['type'], string> = {course: 'DERS', lane: 'PROJE', application: 'BAŞVURU', general: 'İŞ'};
const STATUS: Record<Front['status'], string> = {active: 'AKTİF', held: 'BEKLETİLİYOR', closed: 'KAPANDI'};
const CHOICES: [Decision, string][] = [['continue', 'Sürdür'], ['hold', 'Beklet'], ['close', 'Kapat']];

export default function Review(props: Props) {
  const {state, busy, online, why, action, close} = props;
  const session = state.review && !state.review.completedAt ? state.review : null;
  const steps = reviewSteps(state);
  if (!session) return <div className="review-flow">
    <ReviewTop close={close}/>
    <div className="review-body">
      <p className="review-count">{steps.length} ADIM</p>
      <h2 className="review-title">Haritaya birlikte bakalım.</h2>
      <p className="review-lead">Bayat cepheler, depo, aktif projeler, ufuk{steps.some(x => x.index === ROUTINE_STEP) ? ', rutinler' : ''} ve özet. Yarıda kapatırsan kaldığın adım saklanır.</p>
      {state.review?.completedAt && <details className="archive"><summary>Son teftiş özeti</summary>{state.review.decisions.map((d, i) => <p key={i}>{d}</p>)}</details>}
    </div>
    <div className="review-bar">
      <span/>
      <button className="btn-main" disabled={busy || !online} onClick={() => action({kind: 'reviewStart'}, {silent: true})}>Teftişi başlat<ArrowRight size={18}/></button>
    </div>
    {(busy || !online) && <p className="why review-why">{why}</p>}
  </div>;
  // The lane selection lives with this review: a new review starts from the lanes active then.
  return <Steps key={session.id} {...props} step={session.step}/>;
}

function ReviewTop({close, later}: {close: () => void; later?: () => void}) {
  return <header className="review-top">
    <button className="review-close" aria-label="Kapat" onClick={close}><X size={20}/></button>
    <span>Haftalık teftiş</span>
    {later ? <button className="review-later" onClick={later}>Sonra devam</button> : <span/>}
  </header>;
}

function Steps({state, now, busy, online, why, action, close, horizon, pattern, step}: Props & {step: number}) {
  const steps = reviewSteps(state), pos = stepPosition(steps, step), shown = steps[pos].index, [logging, setLogging] = useState<string | null>(null);
  const lanes = Object.values(state.fronts).filter(f => f.type === 'lane' && f.status !== 'closed');
  const active = lanes.filter(f => f.status === 'active').map(f => f.id).sort().join();
  // The lane step follows the lanes active now (step 1 decisions, a dictation processed meanwhile); only the
  // boxes ticked or cleared on the step itself are held here, and they are dropped once the step is left.
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const selected = lanes.filter(f => picked[f.id] ?? f.status === 'active').map(f => f.id), changed = [...selected].sort().join() !== active;
  const off = busy || !online, date = new Date(now);
  const fronts = reviewFronts(state, date), brief = horizonBrief(state, date), decisions = state.review?.decisions ?? [];
  const ideas = Object.values(state.ideas ?? {}).filter(i => i.status === 'stored' && !i.reviewedAt).length;

  // Leaving the lane step saves a changed selection first; the step itself is stored on the server.
  async function go(to: number) {
    if (to === step || off) return;
    if (step === 2 && changed && !(await action({kind: 'setup', ids: selected}, {silent: true}))) return;
    setPicked({});
    await action({kind: 'reviewStep', step: to}, {silent: true});
  }
  async function leave() {
    if (step === 2 && changed && online) await action({kind: 'setup', ids: selected}, {silent: true});
    close();
  }
  function decide(f: Front, d: Decision, current?: Decision) {
    if (d === current || off) return;
    if (d === 'continue') void action(f.status === 'closed' ? {kind: 'status', frontId: f.id, status: 'active'} : {kind: 'reviewContinue', frontId: f.id}, {silent: true});
    else void action({kind: 'status', frontId: f.id, status: d === 'hold' ? 'held' : 'closed'}, {silent: true});
  }

  const lead = [
    fronts.length ? `Bir haftadır dokunulmamış ${fronts.length} cephe var. Her biri için bir karar ver ya da geç.` : 'Bir haftadır dokunulmamış açık cephe yok.',
    ideas ? `Depoda ${ideas} yeni kalem var. Hamleye çevirebilir, atabilir ya da olduğu gibi bırakabilirsin.` : 'Bu teftiş için yeni depo kalemi kalmadı.',
    'İstediğin kadar proje seç. Diğerleri bekler; tarihli kalemleri Ufuk’ta izlenir.',
    'Önümüzdeki 14 gün: çakışmalar ve hazırlığı başlamamış kalemler.',
    'Haftanın sayıları. Kaydetmeyi unuttuğun seans varsa ekle.',
    'Bu teftişte verdiğin kararlar. Tamamlayınca teftiş kaydedilir.',
  ][shown];
  const today = dayKey(date), routines = reviewRows(state, today), ready = proposals(state, today, true), slides = slideSuggestions(state, today);

  return <div className="review-flow">
    <ReviewTop close={() => void leave()} later={() => void leave()}/>
    <nav className="review-steps-bar" aria-label="Teftiş adımları">
      {steps.map(s => <button key={s.tag} aria-current={s.index === shown ? 'step' : undefined} disabled={off} onClick={() => void go(s.index)}><span/>{s.tag}</button>)}
    </nav>
    <div className="review-body">
      <p className="review-count">ADIM {pos + 1} / {steps.length}</p>
      <h2 className="review-title">{steps[pos].title}</h2>
      <p className="review-lead">{lead}</p>

      {shown === 0 && fronts.map(({front: f, decision, days}) => {
        const move = nextMove(f);
        return <article className="stale-card" key={f.id}>
          <div className="stale-top"><span className={`stale-bar ${f.type}`}/><span>{TYPE[f.type]} · {STATUS[f.status]}</span>{days !== null && <span className="stale-days">{days} GÜNDÜR</span>}</div>
          <h3>{f.title}</h3>
          {(move || f.where) && <><p className="stale-label">{move ? 'SIRADAKİ HAMLE' : 'KALDIĞIN YER'}</p><p className="stale-move">{move?.text ?? f.where}</p></>}
          {f.status === 'held' && days !== null && days > 28 && <p className="stale-note">Uzun süredir bekliyor. Artık gündeminde değilse kapatabilirsin; yeniden açılabilir.</p>}
          <div className="stale-choices">
            {CHOICES.filter(([d]) => d !== 'hold' || f.type === 'lane').map(([d, label]) => <button key={d} aria-pressed={decision === d} className={decision === d ? 'is-chosen' : undefined} disabled={off} onClick={() => decide(f, d, decision)}>{label}{decision === d && <Check size={16}/>}</button>)}
          </div>
        </article>;
      })}

      {shown === 1 && <Research state={state} busy={off} action={action} pending/>}

      {shown === 2 && <>
        {lanes.map(f => <label className="choice" key={f.id}><Checkbox checked={selected.includes(f.id)} onCheckedChange={checked => setPicked(p => ({...p, [f.id]: checked === true}))}/><span><strong>{f.title}</strong>{laneSuggestion(state, f) && <small>Öneri · {laneSuggestion(state, f)}</small>}</span></label>)}
        {!lanes.length && <p className="quiet">Henüz proje yok.</p>}
        <p className="quiet review-lanes">{selected.length} proje seçili · Sonraki adıma geçince kaydedilir.</p>
      </>}

      {shown === 3 && <div className="review-brief">
        <p className="review-brief-counts">{brief.items.length} TARİHLİ KALEM · {brief.conflicts.length} ÇAKIŞMA · {brief.unprepared} HAZIRLIĞI BAŞLAMAMIŞ</p>
        {brief.conflicts.map(c => <p className="brief-conflict" key={c.id}><span>SAAT ÇAKIŞMASI</span>{c.a.title} ve {c.b.title}, {c.a.time}</p>)}
        {brief.items.slice(0, 6).map(r => <div className="brief-row" key={r.event.id + r.event.date}>
          <span>{r.when}</span><span>{r.event.title}</span>
          {r.total > 0 && <span className={r.done ? undefined : 'is-open'}>HAZIRLIK {r.done}/{r.total}</span>}
        </div>)}
        <button className="text-button brief-open" onClick={() => void leave().then(horizon)}>Ufuk’u aç<ChevronRight size={16}/></button>
      </div>}

      {shown === ROUTINE_STEP && <>
        {routines.slice(0, 3).map(x => <div className="review-routine" key={x.routine.id}>
          <span>{x.routine.title}</span><span>{x.done}/{x.target}</span>
          <button disabled={off || x.routine.status === 'paused'} onClick={() => setLogging(x.routine.id)}>+ Seans</button>
        </div>)}
        {routines.length > 3 && <p className="review-routines-more">+{routines.length - 3} rutin · hepsi Rutinler’de</p>}
        {ready.length > 0 && <section className="review-card">
          <div className="review-card-top"><span>HAFTALIK DÜZEN</span><span>{ready.length} RUTİN</span></div>
          <h2>Haftalık düzen hazır.</h2>
          <p>{andList(ready.map(p => p.routine.title))} için gördüğümü yazdım.</p>
          <button className="btn-quiet" onClick={() => void leave().then(pattern)}>Düzeni gör</button>
        </section>}
        {slides.map(x => <section className="review-card" key={x.routine.id}>
          <div className="review-card-top"><span>KAYAN GÜN</span><span>{x.routine.title.toLocaleUpperCase('tr-TR')}</span></div>
          <p>{x.text}</p>
          <button className="btn-quiet" disabled={off} onClick={() => void action({kind: 'routinePattern', routineId: x.routine.id, days: x.days}, {silent: true})}>Düzeni değiştir</button>
        </section>)}
        <ScaffoldCard state={state} today={today} busy={busy} online={online} action={action} review/>
        <TrialCard state={state} today={today} busy={busy} online={online} action={action}/>
        <LogSheet key={logging ?? 'none'} state={state} id={logging} now={now} busy={busy} online={online} why={why} action={action} close={() => setLogging(null)}/>
      </>}

      {shown === 5 && (decisions.length
        ? <ul className="review-summary">{decisions.map((d, i) => <li key={i}>{d}</li>)}</ul>
        : <p className="quiet">Bu teftişte henüz harita değişikliği yapmadın.</p>)}

      <p className="review-note">Her karar kayıt defterine düşer. Kapatırsan kaldığın adım saklanır.</p>
    </div>
    <div className="review-bar">
      <button className="review-prev" disabled={pos === 0 || off} onClick={() => void go(steps[pos - 1].index)}>Önceki</button>
      {pos < steps.length - 1
        ? <button className="btn-main" disabled={off} onClick={() => void go(steps[pos + 1].index)}>Sonraki: {steps[pos + 1].title}<ArrowRight size={18}/></button>
        : <button className="btn-main" disabled={off} onClick={async () => { if (await action({kind: 'reviewFinish'})) close(); }}>Teftişi tamamla<Check size={18}/></button>}
    </div>
    {off && <p className="why review-why">{why}</p>}
  </div>;
}

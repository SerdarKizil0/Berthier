'use client';
// Haftalık teftiş as a full-screen flow (design 1j): no tab bar, named steps, one card per stale front with
// three one-tap decisions saved at once, and a single main action that names the next step. Every decision
// goes through the existing commands and lands in the change log; leaving keeps the step (review.step).
import {useState} from 'react';
import {ArrowRight, Check, ChevronRight, X} from 'lucide-react';
import {Checkbox} from '@/components/ui/checkbox';
import {nextMove, type Front, type State} from '@/lib/domain';
import {laneSuggestion} from '@/lib/research';
import {STEPS, horizonBrief, reviewFronts, type Decision} from '@/lib/book';
import Research from './research';

type Action = (body: {kind: string; [key: string]: unknown}, options?: {quiet?: boolean; silent?: boolean}) => Promise<boolean | undefined>;
type Props = {state: State; now: number; busy: boolean; online: boolean; why: string; action: Action; close: () => void; horizon: () => void};

const TYPE: Record<Front['type'], string> = {course: 'DERS', lane: 'KULVAR', application: 'BAŞVURU', general: 'GENEL'};
const STATUS: Record<Front['status'], string> = {active: 'AKTİF', held: 'BEKLETİLİYOR', closed: 'KAPANDI'};
const CHOICES: [Decision, string][] = [['continue', 'Sürdür'], ['hold', 'Beklet'], ['close', 'Kapat']];

export default function Review(props: Props) {
  const {state, busy, online, why, action, close} = props;
  const session = state.review && !state.review.completedAt ? state.review : null;
  if (!session) return <div className="review-flow">
    <ReviewTop close={close}/>
    <div className="review-body">
      <p className="review-count">{STEPS.length} ADIM</p>
      <h2 className="review-title">Haritaya birlikte bakalım.</h2>
      <p className="review-lead">Bayat cepheler, depo, aktif kulvarlar, ufuk ve özet. Yarıda kapatırsan kaldığın adım saklanır.</p>
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

function Steps({state, now, busy, online, why, action, close, horizon, step}: Props & {step: number}) {
  const lanes = Object.values(state.fronts).filter(f => f.type === 'lane' && f.status !== 'closed');
  const activeIds = lanes.filter(f => f.status === 'active').map(f => f.id), active = [...activeIds].sort().join();
  // The lane step starts from the lanes active now (step 1 decisions change them); only a choice made on the
  // step itself is held here, and it is dropped once the step is left.
  const [picked, setPicked] = useState<string[] | null>(null);
  const selected = (picked ?? activeIds).filter(id => lanes.some(f => f.id === id)), changed = [...selected].sort().join() !== active;
  const off = busy || !online, date = new Date(now);
  const fronts = reviewFronts(state, date), brief = horizonBrief(state, date), decisions = state.review?.decisions ?? [];
  const ideas = Object.values(state.ideas ?? {}).filter(i => i.status === 'stored' && !i.reviewedAt).length;

  // Leaving the lane step saves a changed selection first; the step itself is stored on the server.
  async function go(to: number) {
    if (to === step || off) return;
    if (step === 2 && changed && !(await action({kind: 'setup', ids: selected}, {silent: true}))) return;
    setPicked(null);
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
    'İstediğin kadar kulvar seç. Diğerleri bekler; tarihli kalemleri Ufuk’ta izlenir.',
    'Önümüzdeki 14 gün: çakışmalar ve hazırlığı başlamamış kalemler.',
    'Bu teftişte verdiğin kararlar. Tamamlayınca teftiş kaydedilir.',
  ][step];

  return <div className="review-flow">
    <ReviewTop close={() => void leave()} later={() => void leave()}/>
    <nav className="review-steps-bar" aria-label="Teftiş adımları">
      {STEPS.map((s, i) => <button key={s.tag} aria-current={i === step ? 'step' : undefined} disabled={off} onClick={() => void go(i)}><span/>{s.tag}</button>)}
    </nav>
    <div className="review-body">
      <p className="review-count">ADIM {step + 1} / {STEPS.length}</p>
      <h2 className="review-title">{STEPS[step].title}</h2>
      <p className="review-lead">{lead}</p>

      {step === 0 && fronts.map(({front: f, decision, days}) => {
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

      {step === 1 && <Research state={state} busy={off} action={action} pending/>}

      {step === 2 && <>
        {lanes.map(f => <label className="choice" key={f.id}><Checkbox checked={selected.includes(f.id)} onCheckedChange={checked => setPicked(ids => { const base = ids ?? activeIds; return checked ? [...base.filter(id => id !== f.id), f.id] : base.filter(id => id !== f.id); })}/><span><strong>{f.title}</strong>{laneSuggestion(state, f) && <small>Öneri · {laneSuggestion(state, f)}</small>}</span></label>)}
        {!lanes.length && <p className="quiet">Henüz kulvar yok.</p>}
        <p className="quiet review-lanes">{selected.length} kulvar seçili · Sonraki adıma geçince kaydedilir.</p>
      </>}

      {step === 3 && <div className="review-brief">
        <p className="review-brief-counts">{brief.items.length} TARİHLİ KALEM · {brief.conflicts.length} ÇAKIŞMA · {brief.unprepared} HAZIRLIĞI BAŞLAMAMIŞ</p>
        {brief.conflicts.map(c => <p className="brief-conflict" key={c.id}><span>SAAT ÇAKIŞMASI</span>{c.a.title} ve {c.b.title}, {c.a.time}</p>)}
        {brief.items.slice(0, 6).map(r => <div className="brief-row" key={r.event.id + r.event.date}>
          <span>{r.when}</span><span>{r.event.title}</span>
          {r.total > 0 && <span className={r.done ? undefined : 'is-open'}>HAZIRLIK {r.done}/{r.total}</span>}
        </div>)}
        <button className="text-button brief-open" onClick={() => void leave().then(horizon)}>Ufuk’u aç<ChevronRight size={16}/></button>
      </div>}

      {step === 4 && (decisions.length
        ? <ul className="review-summary">{decisions.map((d, i) => <li key={i}>{d}</li>)}</ul>
        : <p className="quiet">Bu teftişte henüz harita değişikliği yapmadın.</p>)}

      <p className="review-note">Her karar kayıt defterine düşer. Kapatırsan kaldığın adım saklanır.</p>
    </div>
    <div className="review-bar">
      <button className="review-prev" disabled={step === 0 || off} onClick={() => void go(step - 1)}>Önceki</button>
      {step < STEPS.length - 1
        ? <button className="btn-main" disabled={off} onClick={() => void go(step + 1)}>Sonraki: {STEPS[step + 1].title}<ArrowRight size={18}/></button>
        : <button className="btn-main" disabled={off} onClick={async () => { if (await action({kind: 'reviewFinish'})) close(); }}>Teftişi tamamla<Check size={18}/></button>}
    </div>
    {off && <p className="why review-why">{why}</p>}
  </div>;
}

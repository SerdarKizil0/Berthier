'use client';
// Rutinler (design 4 Ekim, “Berthier Rutinler”, A1–A7, B3, B4): the routines' one home (K6). Today in time
// order with what is left of it, then the week's numbers; the cards that come and go (observation, the weekly
// pattern ready, scaffolding to take down). A row opens the record sheet (A4); + opens Söyle as “Yeni rutin”.
// Routines never join the order, the map or Ufuk; nothing here counts a streak.
import {useState} from 'react';
import {Check, ChevronRight, Play, Plus, Repeat} from 'lucide-react';
import {dayKey, type State} from '@/lib/domain';
import {addDays, daysBetween} from '@/lib/calendar';
import {
  LEAD_MIN, OBSERVE_DAYS, WEEK_ORDER, at, clock, daysText, durationChip, observation, proposals, recentSessions, routinesOf,
  runningInfo, scaffolds, slideTarget, startOf, stepsView, todayList, trialResult, usual, weekDone, weekLine, weekOf, weekRows, weekStart, weekday,
  type Routine, type Scaffold,
} from '@/lib/routines';
import {DAY_NAMES, WD, andList, dayMonth, genitive, minutesText, minutesUpper, onDate, shortDay, untilTime, upper} from '@/lib/turkish';
import PageHead from './page-head';
import SaySheet from './say-sheet';

type Action = (body: {kind: string; [key: string]: unknown}, options?: {quiet?: boolean; silent?: boolean}) => Promise<boolean | undefined>;
type Common = {state: State; now: number; busy: boolean; online: boolean; why: string; action: Action};

const SOURCE = {timer: 'sayaç', tap: 'yaptım', dictation: 'dikte', review: 'teftiş'};

/** Filled dots for the week's sessions, empty ones for what is left; no streak, no red. */
function Dots({done, target}: {done: number; target: number}) {
  const shown = Math.min(target, 7);
  return <span className="rt-dots" aria-label={`Bu hafta ${done}/${target}`}>
    {Array.from({length: shown}, (_, i) => <i key={i} className={i < done ? 'rt-dot is-done' : 'rt-dot'}/>)}
    <span className="rt-count">{done}/{target}</span>
  </span>;
}

/** Seven day chips, Monday first; a day tried but not proposed is dashed. */
export function DayChips({days, tried = [], disabled, toggle}: {days: number[]; tried?: number[]; disabled?: boolean; toggle?: (day: number) => void}) {
  return <div className="rt-chips" role="group" aria-label="Haftanın günleri">
    {WEEK_ORDER.map(d => <button key={d} aria-pressed={days.includes(d)} aria-label={DAY_NAMES[d]} className={!days.includes(d) && tried.includes(d) ? 'is-tried' : undefined} disabled={disabled || !toggle} onClick={() => toggle?.(d)}>{upper(WD[d])}</button>)}
  </div>;
}

/** B4 (and the review's RUTİN step): scaffolding that can come down. Either card answered drops the other. */
export function ScaffoldCard({state, today, busy, online, action, review}: Pick<Common, 'state' | 'busy' | 'online' | 'action'> & {today: string; review?: boolean}) {
  const {items, notes, weeks} = scaffolds(state, today), off = busy || !online;
  if (!items.length) return null;
  const answer = (x: Scaffold, accept: boolean) => action({kind: 'routineScaffold', routineId: x.routine.id, what: x.what, accept}, {silent: review});
  return <section className="review-card rt-scaffold">
    <div className="review-card-top"><span>İSKELE · {items.length} ÖNERİ</span>{weeks > 0 && <span>{weeks} HAFTALIK DÜZEN</span>}</div>
    {items.map((x, i) => <div key={x.routine.id + x.what} className={i ? 'rt-scaffold-item' : undefined}>
      {i === 0 ? <h2>{x.title}</h2> : <p className="rt-scaffold-title">{x.title}</p>}
      <p>{x.text}</p>
      <div className="stale-choices"><button disabled={off} onClick={() => void answer(x, true)}>{x.yes}</button><button className="is-short" disabled={off} onClick={() => void answer(x, false)}>{x.no}</button></div>
    </div>)}
    {notes.map(n => <p key={n} className="rt-scaffold-note">{n}</p>)}
  </section>;
}

/** The two-week reminder trial (“Yarısına”): the two groups' numbers side by side, no comment. */
export function TrialCard({state, today, busy, online, action}: Pick<Common, 'state' | 'busy' | 'online' | 'action'> & {today: string}) {
  const t = trialResult(state, today), off = busy || !online;
  if (!t) return null;
  return <section className="rt-card rt-trial">
    <p className="rt-card-label">HATIRLATMA DENEMESİ · 2 HAFTA</p>
    <div className="rt-trial-grid">
      {([['HATIRLATMALI', t.a], ['HATIRLATMASIZ', t.b]] as const).map(([label, g]) => <div key={label}><span>{label} · {g.routines}</span><strong>{g.done} / {g.target}</strong><small>seans</small></div>)}
    </div>
    <div className="stale-choices">
      {([['all', 'Hepsine aç'], ['keep', 'Böyle kalsın'], ['none', 'Hepsini kapat']] as const).map(([k, label]) => <button key={k} disabled={off} onClick={() => void action({kind: 'routineTrial', trial: k}, {silent: true})}>{label}</button>)}
    </div>
  </section>;
}

export default function Routines({state, now, busy, online, action, open, record, say}: Common & {open: (view: string) => void; record: (id: string) => void; say: () => void}) {
  const date = new Date(now), today = dayKey(date), all = routinesOf(state), live = all.filter(r => r.status !== 'paused'), paused = all.filter(r => r.status === 'paused');
  const watch = observation(state, today), ready = proposals(state, today, !!state.review && !state.review.completedAt), list = todayList(state, date), rows = weekRows(state, today);
  return <div className="routines">
    <header className="rt-head"><span>{weekLine(today)}</span><button className="icon-button" aria-label="Yeni rutin söyle" onClick={say}><Plus size={20}/></button></header>
    <h1 className="rt-title">Rutinler</h1>
    {watch && <section className="review-card rt-observe">
      <div className="review-card-top"><span>GÖZLEM</span><span>{watch.day}. GÜN / {OBSERVE_DAYS}</span></div>
      <h2>Önce izliyorum.</h2>
      <p>{watch.text}</p>
      <div className="rt-cells" aria-hidden="true">{watch.cells.map((c, i) => <span key={i} className={'is-' + c}/>)}</div>
    </section>}
    {ready.length > 0 && <section className="review-card rt-ready">
      <div className="review-card-top"><span>HAFTALIK DÜZEN</span><span>{ready.length} RUTİN</span></div>
      <h2>Haftalık düzen hazır.</h2>
      <p>{andList(ready.map(p => p.routine.title))} için gördüğümü yazdım; onaylarsan düzen olur.</p>
      <button className="btn-quiet" onClick={() => open('routine-pattern')}>Düzeni gör</button>
    </section>}
    <ScaffoldCard state={state} today={today} busy={busy} online={online} action={action}/>
    {!all.length ? <section className="rt-empty">
      <Repeat size={30}/>
      <h2>Henüz rutin yok.</h2>
      <p>Tekrar eden işlerini tek cümleyle söyle: “Haftada 4 yüz yogası, hafta içi her sabah sprint.” İki hafta yalnız kayıt tutarım; sonra haftalık düzeni öneririm.</p>
      <button className="btn-quiet" onClick={say}>Rutinlerini söyle</button>
    </section> : <>
      <section className="rt-section">
        <h2><span>BUGÜN · {list.planned ? `${list.count} RUTİN` : `${list.rows.length} KAYIT`}</span>{list.planned ? <span className="is-gold">{list.left ? `KALAN ≈${minutesUpper(list.left)}` : 'BUGÜN TAMAM'}</span> : list.total > 0 && <span>{minutesUpper(list.total)}</span>}</h2>
        {list.rows.map(row => {
          const body = <><span className="rt-time">{row.time}</span><span className="rt-name">{row.title}{row.sub && <small>{row.sub}</small>}</span>{row.chip ? <span className={row.tone === 'done' || row.tone === 'running' ? 'hq-chip is-done' : 'hq-chip'}>{row.chip}</span> : <span/>}</>;
          return row.tone === 'fixed' ? <div key={row.key} className="rt-row is-fixed">{body}</div> : <button key={row.key} className={'rt-row is-' + row.tone} onClick={() => record(row.ids.at(-1)!)}>{body}</button>;
        })}
        {!list.rows.length && <p className="rt-note">{list.planned ? 'Bugün için planlı rutin yok.' : 'Bugün henüz kayıt yok. Bir rutine dokun: Başlat ya da Yaptım.'}</p>}
      </section>
      <section className="rt-section">
        <h2><span>BU HAFTA{all.some(r => r.status === 'settled') ? ` · ${upper(weekRange(today))}` : ''}</span><span>{live.length} RUTİN</span></h2>
        {rows.map(w => <button key={w.routine.id} className="rt-week" onClick={() => record(w.routine.id)}>
          <span className="rt-name">{w.routine.title}<small>{w.sub}</small></span>
          <Dots done={w.done} target={w.target}/>
        </button>)}
      </section>
      {paused.length > 0 && <details className="archive"><summary>Durdurulan rutinler ({paused.length})</summary>{paused.map(r => <button key={r.id} className="rt-week" onClick={() => open('routine:' + r.id)}><span className="rt-name">{r.title}<small>Durduruldu · {sessionsCount(state, r)} kayıt saklı</small></span><ChevronRight size={18}/></button>)}</details>}
    </>}
  </div>;
}

const sessionsCount = (s: State, r: Routine) => (s.sessions ?? []).filter(x => x.routineId === r.id).length;
/** “5–11 Eki”. */
function weekRange(today: string) {
  const w = weekOf(today), a = dayMonth(w[0]).split(' '), b = dayMonth(w[6]).split(' ');
  return a[1] === b[1] ? `${a[0]}–${b[0]} ${b[1]}` : `${a[0]} ${a[1]} – ${b[0]} ${b[1]}`;
}

/** A2 · Ayna: the weekly pattern Berthier saw, one card per routine; a day chip changes it before approval.
 *  The reminder choice comes with the approval: none, half (the trial) or all. */
export function PatternPage({state, now, busy, online, why, action, back}: Common & {back: () => void}) {
  const today = dayKey(new Date(now)), inReview = !!state.review && !state.review.completedAt, list = proposals(state, today, inReview);
  const [days, setDays] = useState<Record<string, number[]>>({}), [remind, setRemind] = useState<'none' | 'half' | 'all'>('none');
  const asOf = inReview ? addDays(today, 1) : weekStart(today), from = list.map(p => p.routine.observeFrom).sort()[0] ?? today;
  const records = (state.sessions ?? []).filter(x => list.some(p => p.routine.id === x.routineId) && x.day >= from && x.day < asOf).length;
  const waiting = routinesOf(state).filter(r => r.status === 'observing' && !list.some(p => p.routine.id === r.id)).map(r => r.title);
  const off = busy || !online;
  const toggle = (id: string, base: number[], d: number) => setDays(x => { const cur = x[id] ?? base, next = cur.includes(d) ? cur.filter(y => y !== d) : [...cur, d]; return next.length ? {...x, [id]: next} : x; });
  async function approve() { if (await action({kind: 'routinePatternAll', patterns: list.map(p => ({routineId: p.routine.id, days: days[p.routine.id] ?? p.days, time: p.time})), reminder: remind})) back(); }
  return <div className="rt-pattern">
    <PageHead title="Haftalık düzen" back="Rutinler" onBack={back} meta={list.length ? upper(`${dayMonth(from)} – ${dayMonth(addDays(asOf, -1))} gözlemi · ${records} kayıt`) : undefined}/>
    {!list.length ? <p className="rt-lead">Henüz önerilecek düzen yok. Bir rutin {OBSERVE_DAYS} gün ve yeterli kayıttan sonra burada görünür.</p> : <>
      <p className="rt-lead">Gördüğümü yazdım; emir değil. Bir güne dokunursan değişir.{waiting.length ? ` ${waiting.length === 1 ? genitive(waiting[0]) + ' kaydı' : andList(waiting) + ' için kayıt'} az, gözlem sürüyor.` : ''}</p>
      {list.filter(p => !p.compact).map(p => <section key={p.routine.id} className="rt-card">
        <div className="rt-card-top"><span>{upper(p.routine.title)}</span><span>{upper(`haftada ${p.routine.count} · ${p.n} kayıt`)}</span></div>
        <p>{p.text}</p>
        <DayChips days={days[p.routine.id] ?? p.days} tried={p.tried} disabled={off} toggle={d => toggle(p.routine.id, p.days, d)}/>
      </section>)}
      {list.filter(p => p.compact).map(p => <div key={p.routine.id} className="rt-compact">
        <span>{p.routine.title}</span><span>{p.range ? `${p.range[0]}–${p.range[1]} DK` : p.minutes !== null ? `≈${minutesUpper(p.minutes)}` : ''}</span>
        <small>{daysText(p.days)} {p.time}{p.routine.travel ? ' · yol dahil' : ''}{p.after && state.routines?.[p.after] ? ` · ${state.routines[p.after].title} ardından` : ''}</small>
      </div>)}
    </>}
    {list.length > 0 && <div className="mr-bar">
      <div className="rt-remind" role="group" aria-label="Hatırlatma">
        <span>HATIRLATMA</span>
        {([['none', 'Hiçbirine'], ['half', 'Yarısına'], ['all', 'Hepsine']] as const).map(([k, label]) => <button key={k} aria-pressed={remind === k} onClick={() => setRemind(k)}>{label}{k === 'half' && <small>DENEME</small>}</button>)}
      </div>
      <button className="btn-main mr-approve" disabled={off} onClick={() => void approve()}><span>Düzeni onayla</span><span>{list.length} RUTİN</span></button>
      {off && <p className="why">{why}</p>}
    </div>}
  </div>;
}

/** The duration strip (A6): every measurement a dot, the median a gold line, the first estimate a ring. */
function DurationStrip({values, median, said}: {values: number[]; median: number | null; said?: number}) {
  const all = [...values, ...(said ? [said] : [])], lo = Math.floor(Math.min(...all) / 10) * 10, hi = Math.max(lo + 20, Math.ceil(Math.max(...all) / 10) * 10);
  const at = (v: number) => `${((v - lo) / (hi - lo)) * 90 + 5}%`;
  const ticks = [lo, Math.round((lo + hi) / 20) * 10, hi];
  return <div className="rt-strip" aria-hidden="true">
    <span className="rt-axis"/>
    {median !== null && <span className="rt-median" style={{left: at(median)}}/>}
    {said && <span className="rt-said" style={{left: at(said)}}/>}
    {values.map((v, i) => <i key={i} className={median !== null && Math.round(v) === median ? 'is-mid' : undefined} style={{left: at(v)}}/>)}
    {ticks.map((t, i) => <span key={i} className="rt-tick" style={{left: at(t)}}>{t}{i === 2 ? ' DK' : ''}</span>)}
  </div>;
}

/** A6 · Rutin ayrıntısı (and A7 for a routine with steps). */
export function RoutineDetail({state, id, now, busy, online, why, action, back, record}: Common & {id: string; back: () => void; record: (id: string) => void}) {
  const r = state.routines?.[id], date = new Date(now), today = dayKey(date);
  const [time, setTime] = useState<string | null>(null);
  if (!r) return <><PageHead title="Rutin" back="Rutinler" onBack={back}/><p className="rt-lead">Bu rutin artık yok. Kayıt defterinden geri alınabilir.</p></>;
  const u = usual(state, r), p = r.pattern, off = busy || !online, settled = r.status === 'settled' && !!p;
  const status = r.status === 'paused' ? 'DURDURULDU' : settled ? 'DÜZENLİ' : 'GÖZLEMDE';
  const since = settled ? dayKey(new Date(p!.approvedAt)) : r.observeFrom;
  const meta = r.steps?.length ? `HAFTADA ${r.count} · ${r.steps.length} ADIM · BU HAFTA ${weekDone(state, r, today)}/${r.count}` : `${upper(r.count >= 7 ? 'her gün' : `haftada ${r.count}`)} · ${status} · ${upper(dayMonth(since))}’DEN BERİ`;
  const lead = r.travel ? r.travel + LEAD_MIN : r.reminder.leadMin;
  const remindAt = settled ? clock(new Date(at(today, p!.time).getTime() - lead * 60000).toISOString()) : '';
  const toggleDay = (d: number) => { if (!p) return; const days = p.days.includes(d) ? p.days.filter(x => x !== d) : [...p.days, d]; if (days.length) void action({kind: 'routinePattern', routineId: r.id, days}); };
  const watchDay = Math.min(OBSERVE_DAYS, daysBetween(r.observeFrom, today) + 1);
  return <div className="rt-detail">
    <PageHead title={r.title} back="Rutinler" onBack={back} meta={meta}/>
    {r.steps?.length ? <Steps state={state} r={r} now={date} busy={busy} online={online} action={action} record={record}/> : <>
      <section className="rt-card">
        <div className="rt-card-top"><span>{settled ? 'HAFTALIK DÜZEN' : 'GÖZLEM'}</span>{settled ? <button className="rt-time-button" disabled={off} onClick={() => setTime(time === null ? p!.time : null)}>{p!.time} · {durationChip(state, r)}</button> : <span>{watchDay}. GÜN / {OBSERVE_DAYS}</span>}</div>
        {settled ? <>
          <div className="rt-chips-wrap"><DayChips days={p!.days} disabled={off} toggle={toggleDay}/></div>
          {time !== null && <form className="rt-time-form" onSubmit={e => { e.preventDefault(); void action({kind: 'routinePattern', routineId: r.id, days: p!.days, time}).then(ok => { if (ok) setTime(null); }); }}><label>Saat<input type="time" required value={time} onChange={e => setTime(e.target.value)}/></label><button className="btn-quiet" disabled={off}>Kaydet</button></form>}
          <p className="rt-card-note">{dayMonth(r.observeFrom)} – {dayMonth(addDays(since, -1))} gözleminden; {onDate(since)} onayladın. Bir güne dokunmak düzeni değiştirir.</p>
        </> : <p className="rt-card-note">Hangi gün, saat kaçta ve ne kadar sürdüğünü kayıtlardan öğreniyorum. Bu sürede hatırlatma yok.</p>}
      </section>
      <section className="rt-section">
        <h2><span>SÜRE · {u.timed.length} ÖLÇÜM</span><span className="is-gold">{durationChip(state, r) || '—'}</span></h2>
        {u.timed.length > 0 ? <>
          <DurationStrip values={u.timed} median={u.minutes} said={r.estimate?.minutes}/>
          <p className="rt-strip-note">{u.timed.length > 1 ? `${Math.min(...u.timed)}–${Math.max(...u.timed)} dk arasında değişiyor; ortası ${u.minutes}.` : `Bir ölçüm: ${u.timed[0]} dk.`}{r.estimate?.minutes ? ` Halka, eklerken söylediğin ${r.estimate.minutes} dk.` : ''} Sayaç süresi değişen rutinde işe yarar.</p>
        </> : <p className="rt-strip-note">Henüz sayaçla ölçüm yok. “Başlat” ile ölçtükçe her ölçüm burada bir nokta olur.</p>}
        <div className="stale-choices">
          <button className={r.timer ? 'is-chosen' : undefined} aria-pressed={r.timer} disabled={off} onClick={() => !r.timer && void action({kind: 'routineTimer', routineId: r.id, on: true})}>Sayaç kalsın{r.timer && <Check size={16}/>}</button>
          <button className={!r.timer ? 'is-chosen' : undefined} aria-pressed={!r.timer} disabled={off} onClick={() => r.timer && void action({kind: 'routineTimer', routineId: r.id, on: false})}>Tek dokunuş{!r.timer && <Check size={16}/>}</button>
        </div>
      </section>
    </>}
    <div className="pref-group rt-prefs">
      <button className="pref-row" disabled={off || !settled} onClick={() => void action({kind: 'routineReminder', routineId: r.id, on: !r.reminder.on})}><span>Hatırlatma</span><span>{!settled ? 'gözlemde kapalı' : r.reminder.on ? `${remindAt} · açık` : 'kapalı'}</span><ChevronRight size={18}/></button>
      {r.ownWords && <div className="rt-words">
        <button className="pref-row" role="switch" aria-checked={r.ownWords.show} disabled={off} onClick={() => void action({kind: 'routineOwnWords', routineId: r.id, show: !r.ownWords!.show})}><span>Kendi sözün</span><span className={r.ownWords.show ? 'rt-switch is-on' : 'rt-switch'}><i/></span></button>
        <p>“{r.ownWords.text.replace(/^[“"]|[”"]$/g, '')}”</p>
      </div>}
    </div>
    <p className="pref-note">{settled ? 'Hatırlatma şimdilik uygulama açıkken durum kartında görünür; bildirimler ayrıca kurulacak.' : 'Hatırlatma, düzen onaylanınca açılabilir.'}</p>
    <section className="rt-section">
      <h2><span>SON KAYITLAR</span><span>{(state.sessions ?? []).filter(x => x.routineId === r.id).length}</span></h2>
      {recentSessions(state, r).map(x => <div key={x.id} className="rt-log"><span>{upper(shortDay(x.day))}</span><span>{clock(startOf(x))} · {minutesText(x.minutes)}</span><span>{SOURCE[x.source]}</span></div>)}
      {!recentSessions(state, r).length && <p className="rt-note">Henüz kayıt yok.</p>}
    </section>
    <div className="rt-detail-actions">
      {r.status !== 'paused' && <button className="btn-quiet" disabled={off} onClick={() => record(r.id)}>Kayıt ekle</button>}
      <button className="btn-quiet" disabled={off} onClick={() => void action({kind: 'routinePause', routineId: r.id, paused: r.status !== 'paused'})}>{r.status === 'paused' ? 'Rutini yeniden aç' : 'Rutini durdur'}</button>
    </div>
    <p className="pref-note">{r.status === 'paused' ? 'Durdurulan rutin kayıtlarıyla saklanır; yeniden açınca kaldığı yerden sürer.' : 'Durdurulan rutin kayıtlarıyla saklanır, geri açılır.'}</p>
    {off && <p className="why">{why}</p>}
  </div>;
}

/** A7 · steps as the expedition strip's nodes: passed gold, the current one ringed, the next numbered. */
function Steps({state, r, now, busy, online, action, record}: Pick<Common, 'state' | 'busy' | 'online' | 'action'> & {r: Routine; now: Date; record: (id: string) => void}) {
  const view = stepsView(state, r), off = busy || !online, current = view.find(v => v.state === 'now'), next = current ? view.find(v => v.index > current.index && !v.step.wait) : undefined;
  const waiting = current?.step.wait;
  const today = dayKey(now), canSkip = r.status === 'settled' && !(state.skips ?? []).some(k => k.routineId === r.id && k.day === today);
  return <>
    <p className="rt-lead">Günün toplamına yalnız elinle geçen süre girer; bekleme girmez.</p>
    <div className="rt-steps">
      {view.map(v => <div key={v.step.key} className={'rt-step is-' + v.state}>
        <span className="rt-node">{v.state === 'done' ? <Check size={14}/> : v.state === 'now' ? <i/> : String(v.index + 1).padStart(2, '0')}</span>
        <span className="rt-step-body"><small>{v.label}</small><span>{v.step.title}</span>{v.note && <small className="rt-step-note">{v.note}</small>}</span>
        {v.chip ? <span className={v.state === 'done' ? 'hq-chip is-done' : 'hq-chip'}>{v.chip}</span> : <span/>}
      </div>)}
    </div>
    <div className="rt-step-actions">
      {waiting && next ? <button className="btn-quiet" disabled={off} onClick={() => void action({kind: 'routineStart', routineId: r.id, stepKey: next.step.key}, {quiet: true})}>{next.step.title} öne al</button>
        : <button className="btn-quiet" disabled={off} onClick={() => record(r.id)}>{current ? `${current.step.title}: kaydet` : 'Kaydet'}</button>}
      {canSkip && <button className="btn-quiet" disabled={off} onClick={() => void action({kind: 'routineSkip', routineId: r.id, day: today})}>Bu hafta değil</button>}
    </div>
  </>;
}

/** A4 · the record sheet: Başlat measures, Yaptım writes the usual length (corrected after), Bugün değil says
 *  where the session slides before the tap. Once the length has settled (one tap) Yaptım leads. */
export function RecordSheet({state, id, now, busy, online, why, action, close, open}: Common & {id: string | null; close: () => void; open: (view: string) => void}) {
  const r = id ? state.routines?.[id] : undefined, date = new Date(now), today = dayKey(date);
  const off = busy || !online, run = runningInfo(state, date);
  if (!r) return null;
  const u = usual(state, r), n = weekDone(state, r, today), done = (state.sessions ?? []).filter(x => x.routineId === r.id && x.day === today);
  const settled = r.status === 'settled' && !!r.pattern, skipped = (state.skips ?? []).some(k => k.routineId === r.id && k.day === today);
  const slid = settled && !skipped && !done.length ? slideTarget(state, r, today, date) : undefined;
  const step = r.steps?.length ? stepsView(state, r).find(v => v.state === 'now' && !v.step.wait) : undefined;
  const meta = [
    done.length ? `BUGÜN ${clock(startOf(done.at(-1)!))}` : skipped ? 'BUGÜN DEĞİL' : settled ? `SIRADA · ${r.pattern!.time}` : 'GÖZLEMDE',
    durationChip(state, r),
    n ? `BU HAFTA ${n}/${r.count}` : settled ? 'HAFTANIN İLK SEANSI' : `HAFTADA ${r.count}`,
  ].filter(Boolean).join(' · ');
  const mine = run?.routine.id === r.id, other = run && !mine ? run.routine.title : null;
  const start = <button key="start" className={r.timer ? 'btn-main' : 'btn-quiet'} disabled={off || !!run} onClick={() => void action({kind: 'routineStart', routineId: r.id, ...(step ? {stepKey: step.step.key} : {})}, {quiet: true}).then(ok => { if (ok) close(); })}><Play size={18}/>Başlat{step ? ' · ' + step.step.title.toLocaleLowerCase('tr-TR') : ''}</button>;
  const log = <button key="log" className={r.timer ? 'btn-quiet' : 'btn-main'} disabled={off} onClick={() => void action({kind: 'routineLog', routineId: r.id, ...(step ? {stepKey: step.step.key} : {})}).then(ok => { if (ok) close(); })}>Yaptım</button>;
  const skip = settled && !skipped && !done.length && <button key="skip" className="btn-quiet" disabled={off} onClick={() => void action({kind: 'routineSkip', routineId: r.id, day: today}).then(ok => { if (ok) close(); })}>Bugün değil</button>;
  const said = u.minutes !== null ? `Yaptım, ölçülen ${u.range ? `${u.minutes} dk` : `≈${minutesText(u.minutes)}`}’yı yazar; sonra düzeltebilirsin.` : 'Yaptım, 30 dk yazar; sonra düzeltebilirsin.';
  const slide = skip ? (slid ? ` Bugün değil dersen seans ${DAY_NAMES[weekday(slid)]} ${untilTime(r.pattern!.time)} kayar.` : ' Bugün değil dersen bu hafta kayacak boş gün yok; sayı olduğu gibi kalır.') : '';
  return <SaySheet open={!!id} onClose={close} locked={busy} title={r.title} description={meta} metaDescription>
    {mine ? <>
      <button className="btn-main rt-sheet-main" disabled={off} onClick={() => void action({kind: 'routineFinish'}).then(ok => { if (ok) close(); })}><Check size={18}/>Bitti</button>
      <p className="rt-sheet-note">Sayaç {clock(run!.start)} itibarıyla sürüyor. Bitti, süreyi kaydeder; sonra düzeltebilirsin.</p>
    </> : <>
      {r.timer ? <>{start}<div className="rt-sheet-row">{log}{skip}</div></> : <>{log}<div className="rt-sheet-row">{start}{skip}</div></>}
      <p className="rt-sheet-note">{other ? `${other} sayacı sürüyor; Başlat onu bitirince açılır. ` : ''}{r.status === 'observing' ? 'Gözlemdeyim: gün, saat ve süreyi kayıtlardan öğreniyorum. ' : ''}Başlat süreyi ölçer. {said}{slide}</p>
    </>}
    {off && <p className="why">{why}</p>}
    <button className="text-button rt-open" onClick={() => { close(); open('routine:' + r.id); }}>Rutini aç<ChevronRight size={16}/></button>
  </SaySheet>;
}

export type Fix = {sessionId?: string; running?: boolean} | null;

/** “Düzelt” after a save (the length or the end), and “Bitişi düzelt” for a timer left running. */
export function FixSheet({state, fix, busy, online, why, action, close}: Omit<Common, 'now'> & {fix: Fix; close: () => void}) {
  const session = fix?.sessionId ? (state.sessions ?? []).find(x => x.id === fix.sessionId) : undefined, run = fix?.running ? state.running : undefined;
  const r = session ? state.routines?.[session.routineId] : run ? state.routines?.[run.routineId] : undefined;
  const [minutes, setMinutes] = useState(''), [end, setEnd] = useState('');
  const off = busy || !online, open = !!r && (!!session || !!run);
  async function save() {
    const body = session ? {kind: 'routineEdit', sessionId: session.id, ...(minutes ? {minutes: Number(minutes)} : {}), ...(end ? {end} : {})} : {kind: 'routineFinish', ...(end ? {end} : {})};
    if (await action(body)) { setMinutes(''); setEnd(''); close(); }
  }
  return <SaySheet open={open} onClose={close} locked={busy} title={session ? `${r?.title ?? 'Rutin'} · düzelt` : 'Bitişi düzelt'} description={session ? `${clock(startOf(session))} başladı · ${minutesText(session.minutes)} yazıldı` : run ? `${r?.title} ${clock(run.start)} başladı.` : ''}>
    <form className="event-form rt-fix" onSubmit={e => { e.preventDefault(); void save(); }}>
      <div className="field-grid">
        {session && <label>Süre (dk)<input inputMode="numeric" type="number" min={1} max={1440} placeholder={String(session.minutes)} value={minutes} onChange={e => setMinutes(e.target.value)}/></label>}
        <label>Bitiş<input type="time" value={end} placeholder={session ? clock(session.end) : ''} onChange={e => setEnd(e.target.value)} required={!session}/></label>
      </div>
      <button className="btn-main" disabled={off || (!!session && !minutes && !end)}>Kaydet</button>
      {off && <p className="why">{why}</p>}
      <p className="quiet">Kayıt defterinden geri alabilirsin.</p>
    </form>
  </SaySheet>;
}

/** “+ Seans” in the weekly review: a forgotten session, one day and one time this week. */
export function LogSheet({state, id, now, busy, online, why, action, close}: Common & {id: string | null; close: () => void}) {
  const r = id ? state.routines?.[id] : undefined, today = dayKey(new Date(now)), days = weekOf(today).filter(d => d <= today);
  const [day, setDay] = useState(today), [start, setStart] = useState(r?.pattern?.time ?? '');
  const off = busy || !online;
  async function save() { if (r && await action({kind: 'routineLog', routineId: r.id, day, ...(start ? {start} : {})}, {silent: true})) close(); }
  return <SaySheet open={!!r} onClose={close} locked={busy} title={r ? `${r.title} · seans ekle` : ''} description="Kaydetmeyi unuttuğun seans: gün ve saat.">
    <div className="say-choices" role="group" aria-label="Gün">{days.map(d => <button key={d} aria-pressed={day === d} onClick={() => setDay(d)}>{d === today ? 'Bugün' : DAY_NAMES[weekday(d)]}</button>)}</div>
    <form className="event-form rt-fix" onSubmit={e => { e.preventDefault(); void save(); }}>
      <label>Başlangıç<input type="time" value={start} onChange={e => setStart(e.target.value)}/></label>
      <button className="btn-main" disabled={off}>Seansı ekle</button>
      {off && <p className="why">{why}</p>}
    </form>
  </SaySheet>;
}


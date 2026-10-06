'use client';
// “Olduğu gibi ekle” (5 Ekim, user's decision): the dictation sheet's second action. The text becomes a move exactly
// as written — no model, no credit, queued on the device when offline — in the front chosen here. The fronts come
// most recently used first (the sheet's front context, if any, first and chosen); “Yeni cephe” asks only a name (the
// type is İş, K7, and changes on the front page). “Bugünün emrine ekle” follows “Cephe ekle / çıkar”.
import {useState} from 'react';
import {Check, Plus} from 'lucide-react';
import {Checkbox} from '@/components/ui/checkbox';
import {type Front, type State, ensureOrder, moveText, nextMove, normalize} from '@/lib/domain';

export type Place = {frontId: string; title: string; today: boolean};
type Props = {state: State; text: string; context?: string; busy: boolean; back: () => void; add: (place: Place) => void};

/** The fronts to choose from: the context front (unless closed), then the active ones, most recently used first. */
export function asIsFronts(state: State, context?: string): Front[] {
  const first = context ? state.fronts[context] : undefined, own = first && first.status !== 'closed' ? first : undefined;
  const rest = Object.values(state.fronts).filter(f => f.status === 'active' && f.id !== own?.id).sort((a, b) => b.touched.localeCompare(a.touched));
  return own ? [own, ...rest] : rest;
}

/** Whether “Bugünün emrine ekle” is the user's to choose; otherwise what today's route already does and why. */
export function todayRule(state: State, f?: Front): {fixed: false} | {fixed: true; on: boolean; note: string} {
  const order = ensureOrder(state), slot = f && order.slots.find(x => x.frontId === f.id);
  if (slot?.doneAt) return {fixed: true, on: false, note: 'Bugün geçildi; sıradaki hamlesi yarın önerilir.'};
  if (slot) return {fixed: true, on: true, note: 'Zaten bugünün emrinde.'};
  if (f && f.status !== 'active') return {fixed: true, on: false, note: 'Bekletilen proje emre girmez.'};
  if (!state.orders[order.date]) return {fixed: true, on: true, note: 'Emir henüz öneri; yeni hamle öneriye kendiliğinden girer.'};
  return {fixed: false};
}

export default function AsIs({state, text, context, busy, back, add}: Props) {
  const fronts = asIsFronts(state, context);
  const [choice, setChoice] = useState<string | null>(() => context && fronts[0]?.id === context ? context : fronts.length ? null : 'new');
  const [name, setName] = useState(''), [today, setToday] = useState(false);
  const typed = name.replace(/\s+/g, ' ').trim();
  // A new front named like an open one goes to that one (the server does the same).
  const twin = choice === 'new' && typed ? Object.values(state.fronts).find(f => f.status !== 'closed' && normalize(f.title) === normalize(typed)) : undefined;
  const target = choice === 'new' ? twin : choice ? state.fronts[choice] : undefined, rule = todayRule(state, target);
  const why = !choice ? 'Bir cephe seç ya da yeni cephe aç.' : choice === 'new' && !typed ? 'Yeni cephenin adını yaz.' : '';
  function confirm() {
    if (!choice || why) return;
    add({frontId: target?.id ?? crypto.randomUUID(), title: (target?.title ?? typed).slice(0, 90), today: !rule.fixed && today});
  }
  return <>
    <p className="as-is-text">{moveText(text)}</p>
    <div className="type-list as-is-list" role="radiogroup" aria-label="Hangi cepheye?">
      {fronts.map(f => <button key={f.id} role="radio" aria-checked={choice === f.id} className={choice === f.id ? 'type-row is-current' : 'type-row'} onClick={() => setChoice(f.id)}>
        <span className={`type-bar ${f.type}`}/>
        <span><strong>{f.title}</strong><small>{nextMove(f)?.text ?? 'Açık hamlesi yok; bu, sıradaki olur.'}</small></span>
        {choice === f.id ? <Check size={18}/> : <span/>}
      </button>)}
      <button role="radio" aria-checked={choice === 'new'} className={choice === 'new' ? 'type-row is-current' : 'type-row'} onClick={() => setChoice('new')}>
        <Plus size={16}/>
        <span><strong>Yeni cephe</strong><small>Türü İş; cephe sayfasından değişir.</small></span>
        {choice === 'new' ? <Check size={18}/> : <span/>}
      </button>
      {choice === 'new' && <>
        <label className="sr-only" htmlFor="as-is-name">Yeni cephenin adı</label>
        <input id="as-is-name" className="say-field as-is-name" autoFocus maxLength={90} value={name} onChange={e => setName(e.target.value)} placeholder="Cephenin adı"/>
        {twin && <p className="say-foot">“{twin.title}” adında bir cephe var; hamle ona eklenir.</p>}
      </>}
    </div>
    <label className="choice as-is-today">
      <Checkbox checked={rule.fixed ? rule.on : today} disabled={rule.fixed} onCheckedChange={v => setToday(v === true)}/>
      <span><strong>Bugünün emrine ekle</strong><small>{rule.fixed ? rule.note : 'Rotanın sonuna girer; emrin onayı korunur.'}</small></span>
    </label>
    <div className="say-row">
      <button className="btn-quiet" disabled={busy} onClick={back}>Metne dön</button>
      <span className="say-spacer"/>
      <button className="btn-main" disabled={busy || !!why} onClick={confirm}>Ekle</button>
    </div>
    {why && <p className="why">{why}</p>}
  </>;
}

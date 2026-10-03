'use client';
// Kayıt defteri (design 1l): what you said and what Berthier did, in one stream by day. Waiting and failed
// entries come first with their action. A dictation shows the changes it made (Change.sourceId), each with
// its own “Geri al”. A row that cannot be undone says why under itself; the undo rules themselves are
// unchanged (lib/domain.ts `undo`).
import {useMemo, useState} from 'react';
import {RotateCcw} from 'lucide-react';
import {type Change, type Dictation, type State} from '@/lib/domain';
import {clockText} from '@/lib/expedition/camps';
import {describeOp, ledgerDays, undoBlock, type LedgerItem} from '@/lib/ledger';

type Action = (body: {kind: string; [key: string]: unknown}, options?: {quiet?: boolean; silent?: boolean}) => Promise<boolean | undefined>;
type Queued = {id: string; text?: unknown};
type Props = {state: State; dictations: Dictation[]; outbox: Queued[]; now: number; busy: boolean; online: boolean; processing: boolean; action: Action; retry: (d: Dictation) => void};
type Filter = 'all' | 'said' | 'changes' | 'waiting';

const meta = (d: Dictation): {kind?: string; source?: string; replyTo?: string; question?: string; summary?: string} => {
  try { return JSON.parse(d.result ?? '{}'); } catch { return {}; }
};
const PAGE = 30;

export default function Ledger({state, dictations, outbox, now, busy, online, processing, action, retry}: Props) {
  const [filter, setFilter] = useState<Filter>('all'), [limit, setLimit] = useState(PAGE), [full, setFull] = useState<string | null>(null);
  const failed = dictations.filter(d => d.status === 'failed' && !outbox.some(x => x.id === d.id));
  const queued = dictations.filter(d => d.status === 'queued' && !outbox.some(x => x.id === d.id));
  const waiting = failed.length + outbox.length + queued.length, off = busy || !online;

  // The visible page of the stream, and why each of its undos would be refused (computed once per state).
  const {days, more, blocks} = useMemo(() => {
    const all = ledgerDays(state, dictations, new Date(now)).map(d => ({...d, items: d.items.filter(i => filter === 'all' || (filter === 'said' ? i.kind === 'dictation' : i.kind === 'change'))})).filter(d => d.items.length);
    const days: typeof all = [];
    let left = limit;
    for (const d of all) { if (left <= 0) break; days.push({...d, items: d.items.slice(0, left)}); left -= d.items.length; }
    const blocks = new Map<string, string | null>();
    for (const d of days) for (const item of d.items) {
      const c = item.change;
      if (!c) continue;
      blocks.set(c.id, undoBlock(state, c));
      if (item.kind === 'dictation') c.ops.forEach((_, i) => blocks.set(c.id + ':' + i, undoBlock(state, c, i)));
    }
    return {days, more: all.reduce((n, d) => n + d.items.length, 0) > limit, blocks};
  }, [state, dictations, now, filter, limit]);

  const undoButton = (c: Change, index?: number) => {
    const done = index === undefined ? c.ops.every(o => o.undone) : c.ops[index].undone, key = index === undefined ? c.id : c.id + ':' + index, why = blocks.get(key);
    if (done) return <span className="ledger-undone">GERİ ALINDI</span>;
    return <button className="ledger-undo" disabled={off || !!why} onClick={() => action(index === undefined ? {kind: 'undo', changeId: c.id} : {kind: 'undo', changeId: c.id, index})}>{index === undefined && c.ops.length > 1 && c.sourceId ? 'Tümünü geri al' : 'Geri al'}</button>;
  };
  const quote = (id: string, text: string) => <blockquote className="ledger-quote" onClick={() => setFull(full === id ? null : id)}>{full === id || text.length <= 160 ? text : text.slice(0, 150) + '…'}</blockquote>;

  function entry(item: LedgerItem) {
    if (item.kind === 'change') {
      const c = item.change, lines = c.ops.filter(o => !o.undone).map(o => describeOp(o, state.fronts).text), why = blocks.get(c.id);
      return <article className="ledger-row" key={c.id}>
        <span className="ledger-time">{clockText(c.at)}</span>
        <div className="ledger-body">
          <div className="ledger-head"><strong>{c.label}</strong>{undoButton(c)}</div>
          {lines.length > 0 && <p className="ledger-text">{lines.join(' · ')}</p>}
          {why && <p className="ledger-why">{why}</p>}
        </div>
      </article>;
    }
    const d = item.dictation, m = meta(d), c = item.change, live = c?.ops.length ?? 0;
    const who = m.replyTo ? 'Yanıtladın' : m.kind === 'complete' ? 'Kaldığın yeri yazdın' : 'Söyledin';
    return <article className="ledger-row" key={d.id}>
      <span className="ledger-time">{clockText(d.created_at)}</span>
      <div className="ledger-body">
        <div className="ledger-head"><strong>{who}</strong><span className="ledger-chip">{m.source === 'document' ? 'BELGE' : 'YAZI'}</span></div>
        {quote(d.id, d.raw)}
        {c && live > 0 && <>
          <p className="ledger-label">BERTHİER {live} DEĞİŞİKLİK YAPTI</p>
          {c.ops.map((op, i) => {const line = describeOp(op, state.fronts), why = !op.undone && blocks.get(c.id + ':' + i); return <div className="ledger-op" key={i}>
            <p><span>{line.tag}</span> {line.text}</p>{undoButton(c, i)}
            {why && <p className="ledger-why">{why}</p>}
          </div>;})}
          {live > 1 && <div className="ledger-all">{undoButton(c)}{blocks.get(c.id) && !c.ops.every(o => o.undone) && <p className="ledger-why">{blocks.get(c.id)}</p>}</div>}
        </>}
        {!c && d.status === 'question' && <p className="ledger-text">Berthier sordu: {m.question}</p>}
        {!c && d.status !== 'question' && <p className="ledger-text">Değişiklik yapılmadı.</p>}
        {d.status === 'done' && !state.ideaImports?.includes(d.id) && !m.replyTo && <button className="ledger-import" disabled={off} onClick={() => action({kind: 'importIdeas', sourceId: d.id})}>Fikirleri depoya aktar</button>}
      </div>
    </article>;
  }

  return <div className="ledger">
    <p className="ledger-intro">Söylediklerin ve Berthier’in yaptıkları. Her satır tek tek geri alınabilir.</p>
    <div className="filter-chips" role="group" aria-label="Kayıtları süz">
      {([['all', 'Hepsi'], ['said', 'Dikteler'], ['changes', 'Değişiklikler'], ['waiting', `Bekleyen${waiting ? ' ' + waiting : ''}`]] as [Filter, string][]).map(([k, label]) => <button key={k} aria-pressed={filter === k} onClick={() => { setFilter(k); setLimit(PAGE); }}>{label}</button>)}
    </div>
    {(filter === 'all' || filter === 'waiting') && waiting > 0 && <section className="ledger-day">
      <h2>BEKLEYEN · {waiting}</h2>
      {failed.map(d => <article className="ledger-wait" key={d.id}>
        <div className="ledger-head"><span className="ledger-chip is-hot">İŞLENEMEDİ</span><button className="ledger-undo" disabled={busy || !online} onClick={() => retry(d)}><RotateCcw size={15}/>Tekrar dene</button></div>
        {quote(d.id, d.raw)}
        <p className="ledger-why">{[meta(d).summary || 'İşlenemedi.', /sakl|kaydedildi/i.test(meta(d).summary ?? '') ? '' : 'Metnin cihazda ve sunucuda saklı.'].filter(Boolean).join(' ')}</p>
      </article>)}
      {outbox.map(x => <article className="ledger-wait" key={x.id}>
        <div className="ledger-head"><span className="ledger-chip">CİHAZDA</span><span className="ledger-note">{!online ? 'Bağlantı gelince işlenir' : processing ? 'İşleniyor…' : 'Sırada'}</span></div>
        {quote(x.id, String(x.text ?? ''))}
      </article>)}
      {queued.map(d => <article className="ledger-wait" key={d.id}>
        <div className="ledger-head"><span className="ledger-chip">SUNUCUDA</span><span className="ledger-note">İşleniyor…</span></div>
        {quote(d.id, d.raw)}
      </article>)}
    </section>}
    {filter === 'waiting' && !waiting && <p className="quiet">Bekleyen girdi yok.</p>}
    {filter !== 'waiting' && days.map(day => <section className="ledger-day" key={day.day}><h2>{day.label}</h2>{day.items.map(entry)}</section>)}
    {filter !== 'waiting' && !days.length && <p className="quiet">Henüz kayıt yok.</p>}
    {filter !== 'waiting' && more && <button className="text-button" onClick={() => setLimit(limit + PAGE)}>Daha eski kayıtlar</button>}
  </div>;
}

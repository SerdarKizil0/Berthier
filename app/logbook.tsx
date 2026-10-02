'use client';
// Sefer defteri: Berthier's record of the two-week expedition (lib/logbook.ts). It asks nothing of the
// user; missing day records are written by the server when the page opens (logbookSummaries).
import {Fragment, useEffect, useEffectEvent, useState} from 'react';
import {ArrowLeft, ChevronRight, Flag} from 'lucide-react';
import {dayKey, type State} from '@/lib/domain';
import {logbook, staleSummaries} from '@/lib/logbook';

type Props = {state: State; now: number; online: boolean; back: () => void; summarize: () => void};

export default function Logbook({state, now, online, back, summarize}: Props) {
  const today = dayKey(new Date(now)), book = logbook(state, today);
  const [open, setOpen] = useState(false);
  const stale = staleSummaries(state, today).map(x => x.day + x.hash).join();
  const write = useEffectEvent(() => summarize());
  useEffect(() => { if (online && stale) write(); }, [online, stale]);

  return <div className="logbook">
    <header className="mr-head lb-head">
      <button className="mr-back" onClick={back}><ArrowLeft size={16}/>Karargâh</button>
      <h1>Sefer defteri</h1>
      <p>{book.sub}</p>
    </header>
    {book.window ? <>
      <div className="lb-cells" aria-label={`${book.window.index}. gün, 14 günlük sefer`}>
        {book.cells.map(c => <div key={c.day} className={`lb-cell is-${c.state}`}><span/><span>{c.n}</span></div>)}
      </div>
      <p className="lb-totals">ALINAN KAMP <span>{book.camps}</span> · KAPANAN CEPHE <span>{book.closed}</span></p>
      {book.entries.map(e => <article key={e.day} className="lb-entry">
        <div className="lb-entry-top"><span>{e.date}</span><span className={e.gold ? 'is-gold' : undefined}>{e.tag}</span></div>
        {e.nodes.length > 0 && <div className="lb-track" aria-hidden="true">
          <span className="lb-hq">✳</span>
          {e.nodes.map((taken, i) => <Fragment key={i}><span className={(i === 0 || e.nodes[i - 1]) && taken ? 'lb-line is-sealed' : 'lb-line'}/><span className={taken ? 'lb-node is-taken' : 'lb-node'}/></Fragment>)}
        </div>}
        <p className={e.muted ? 'lb-text is-muted' : 'lb-text'}>{e.text}</p>
        {e.closed.map(title => <div className="lb-closed" key={title}><Flag size={14}/>CEPHE KAPANDI · {title}</div>)}
      </article>)}
      <button className="lb-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span><span>Seferin ölçümleri</span><span>{open ? 'Gizlemek için dokun.' : 'Yalnız istediğinde görünür.'}</span></span>
        <ChevronRight size={18}/>
      </button>
      {open && <div className="lb-metrics">
        {book.metrics.map(m => <div key={m.title} className="lb-metric"><div><span>{m.title}</span><span>{m.value}</span></div><span>{m.note}</span></div>)}
        <p>14. günde tek soru sorulur: Kilitlenmeler seyreldi mi? Hükmü sen verirsin.</p>
      </div>}
    </> : <p className="lb-empty">Sefer, ilk sabah raporunu açtığın ya da ilk emri onayladığın gün başlar. Berthier günleri buraya kendisi yazar.</p>}
  </div>;
}

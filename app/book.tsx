'use client';
// Defter (design 1h): records and review in one place. The weekly review card is always on top (and on
// Karargâh when it is due), then the expedition logbook at a glance, the idea depot and the change log.
// Tercihler is the gear at the top right.
import {Archive, ChevronRight, History, Settings} from 'lucide-react';
import {dayKey, type Dictation, type State} from '@/lib/domain';
import {logbook} from '@/lib/logbook';
import {depotLine, ledgerLine, reviewCard} from '@/lib/book';

type Props = {state: State; dictations: Dictation[]; outbox: {id: string}[]; now: number; busy: boolean; online: boolean; why: string; open: (view: string) => void; review: () => void};

/** The weekly review card: Defter always shows it; Karargâh shows it while the review is due. */
export function ReviewCard({state, now, busy, online, why, review}: Pick<Props, 'state' | 'now' | 'busy' | 'online' | 'why' | 'review'>) {
  const card = reviewCard(state, new Date(now)), blocked = !card.open && (busy || !online);
  return <section className="review-card">
    <div className="review-card-top"><span>{card.label}</span><span>{card.when}</span></div>
    <h2>{card.title}</h2>
    <p>{card.meta}</p>
    <button className="btn-quiet" disabled={blocked} onClick={review}>{card.action}</button>
    {blocked && <p className="why">{why}</p>}
  </section>;
}

export default function Book({state, dictations, outbox, now, busy, online, why, open, review}: Props) {
  const book = logbook(state, dayKey(new Date(now)));
  // The latest day with something written; today stays “SÜRÜYOR” until a camp is taken.
  const last = book.entries.find(e => !e.muted) ?? book.entries[0];
  return <div className="book">
    <header className="book-head">
      <span>KAYITLAR VE GÖZDEN GEÇİRME</span>
      <button className="icon-button" aria-label="Tercihler" onClick={() => open('settings')}><Settings size={20}/></button>
    </header>
    <h1>Defter</h1>
    <ReviewCard state={state} now={now} busy={busy} online={online} why={why} review={review}/>
    <section className="book-logbook" aria-label="Sefer defteri">
      <h2><span>SEFER DEFTERİ</span><span>{book.window ? `${book.window.index}. GÜN / 14` : 'İLK RAPORLA BAŞLAR'}</span></h2>
      {book.window ? <>
        <div className="lb-cells" aria-label={`${book.window.index}. gün, 14 günlük sefer`}>
          {book.cells.map(c => <div key={c.day} className={`lb-cell is-${c.state}`}><span/><span>{c.n}</span></div>)}
        </div>
        <p className="lb-totals">ALINAN KAMP <span>{book.camps}</span> · KAPANAN CEPHE <span>{book.closed}</span></p>
        {last && <div className="book-entry">
          <div className="lb-entry-top"><span>{last.date}</span><span className={last.gold ? 'is-gold' : undefined}>{last.tag}</span></div>
          <p className={last.muted ? 'lb-text is-muted' : 'lb-text'}>{last.text}</p>
        </div>}
      </> : <p className="lb-empty">Sefer, ilk sabah raporunu açtığın ya da ilk emri onayladığın gün başlar. Berthier günleri buraya kendisi yazar.</p>}
      <button className="book-link" onClick={() => open('logbook')}>Sefer defterini aç<ChevronRight size={16}/></button>
    </section>
    <button className="book-row" onClick={() => open('depot')}><Archive size={22}/><span><strong>Fikir deposu</strong><small>{depotLine(state)}</small></span><ChevronRight size={18}/></button>
    <button className="book-row" onClick={() => open('history')}><History size={22}/><span><strong>Kayıt defteri</strong><small>{ledgerLine(state, dictations, outbox, new Date(now))}</small></span><ChevronRight size={18}/></button>
  </div>;
}

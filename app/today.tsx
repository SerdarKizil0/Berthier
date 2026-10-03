'use client';
// Karargâh's “Bugün ve yarın” (design 1a): the morning report's sections II–IV, one line each. Unseen
// warnings, places to be today and tomorrow, and Berthier's questions. An empty section makes no line;
// the whole report stays one tap away (“Sabah raporunun tamamı”).
import {useState} from 'react';
import {AlertTriangle, Check, ChevronRight, HelpCircle, MapPin, Sunrise} from 'lucide-react';
import {type Dictation, type State} from '@/lib/domain';
import {type CalendarEvent} from '@/lib/calendar';
import {type Report} from '@/lib/report';
import {shortDay, upper} from '@/lib/turkish';
import {ConflictMailDialog, EventDialog} from './horizon';

type Action = (body: {kind: string; [key: string]: unknown}, options?: {quiet?: boolean; silent?: boolean}) => Promise<boolean | undefined>;
type Props = {state: State; report: Report; busy: boolean; online: boolean; action: Action; reply: (d: Dictation, text: string) => void; write: (d: Dictation) => void; open: () => void};

export default function Today({state, report, busy, online, action, reply, write, open}: Props) {
  const [editing, setEditing] = useState<CalendarEvent | null>(null), [mailId, setMailId] = useState<string | null>(null);
  const warnings = report.warnings.filter(w => !w.seen), places = report.days.flatMap(d => d.places), off = busy || !online;
  const mail = report.warnings.find(w => w.id === mailId)?.conflict;
  const lines = warnings.length + places.length + report.questions.length;
  return <>
    {lines > 0 && <section className="hq-today" aria-labelledby="hq-today">
      <h2 id="hq-today">BUGÜN VE YARIN</h2>
      {warnings.map(w => {
        const c = w.conflict, [first, second] = c ? (c.a.weekly !== c.b.weekly ? (c.a.weekly ? [c.b, c.a] : [c.a, c.b]) : [c.move, c.move === c.a ? c.b : c.a]) : [];
        return <div className="hq-line-item" key={w.id}>
          <AlertTriangle size={18} className="is-hot"/>
          <div>
            <span className="hq-line-label is-hot">{c ? `${w.label} · ${upper(shortDay(c.a.date!))}` : `${w.label} · ${w.meta}`}</span>
            <span className="hq-line-text">{c ? `${first!.title} ve ${second!.title}, ${c.a.time}` : w.text}</span>
            <button className="hq-line-action" disabled={off} onClick={() => c ? setMailId(w.id) : w.event && setEditing({...w.event})}>{c ? 'Mail taslağını aç' : w.action}</button>
          </div>
        </div>;
      })}
      {places.map(p => <div className="hq-line-item" key={p.when + p.event.id}>
        <MapPin size={18}/>
        <div>
          <span className="hq-line-label">{p.when}</span>
          <span className="hq-line-text">{p.title}</span>
          {p.bring && <span className="hq-line-bring">Yanına al: {p.bring.charAt(0).toLocaleLowerCase('tr-TR') + p.bring.slice(1)}</span>}
        </div>
      </div>)}
      {report.questions.map(q => <div className="hq-line-item" key={q.dictation.id}>
        <HelpCircle size={18}/>
        <div>
          <span className="hq-line-label">BERTHİER SORUYOR</span>
          <span className="hq-line-text">{q.question}</span>
          {q.answer
            ? <span className="hq-line-answer"><Check size={16}/>Yanıtın kaydedildi: {q.answer.text}</span>
            : <div className="hq-line-choices">
              {q.choices.map(c => <button key={c} disabled={busy} onClick={() => reply(q.dictation, c)}>{c}</button>)}
              <button onClick={() => write(q.dictation)}>{q.choices.length ? 'Yazıyla' : 'Yanıtla'}</button>
            </div>}
        </div>
      </div>)}
    </section>}
    <button className="hq-report" onClick={open}><span><Sunrise size={20}/>Sabah raporunun tamamı</span><ChevronRight size={18}/></button>
    <EventDialog state={state} busy={busy} action={action} editing={editing} setEditing={setEditing}/>
    <ConflictMailDialog state={state} busy={busy} action={action} conflict={mail} close={() => setMailId(null)}/>
  </>;
}

// The morning report (Sabah raporu): the same four sections in the same order every day, built live
// from the saved state. I Günün emri · II Uyarılar · III Bugün ve yarın · IV Kararını bekleyenler.
// An empty section stays and says so; nothing here changes the state.

import { type Change, type Dictation, type Order, type State, dayKey, propose } from './domain';
import { addDays, calendarDay, conflicts, daysBetween, occurrences, type CalendarEvent, type Conflict, type EventKind } from './calendar';
import { KRITIK, REGIONS, YAKLASAN, clockText, nextDated } from './expedition/camps';
import { questionInput } from './questions';
import { atTime, dayMonth, longDay, possessive, shortDay, upper } from './turkish';

/** Saved preference shown in Tercihler; the report names it as the time of the next report. */
export const REPORT_TIME = '08:30';
const DATED_REASON = 'Tarihli kalemin hazırlık zamanı geldi.';
const pad = (n: number) => String(n).padStart(2, '0');

export type Tone = 'crit' | 'near' | 'calm' | 'done';
export type OrderRow = { frontId: string; num: string; head: string; move: string; why: string; chip: string; tone: Tone; region: string };
export type Warning = {
  id: string; kind: 'conflict' | 'prep'; label: string; meta: string; text: string; seen: boolean; action: string;
  conflict?: Conflict; event?: CalendarEvent;
};
export type Place = { when: string; title: string; context: string; bring: string; event: CalendarEvent };
export type PlaceDay = { when: string; places: Place[] };
export type Answer = { text: string; pending: boolean; change?: Change; at?: string };
export type QuestionCard = { dictation: Dictation; label: string; question: string; choices: string[]; input: 'text' | 'date' | 'time'; answer: Answer | null };
export type DraftCard = { conflict: Conflict; label: string; text: string };
export type Report = {
  day: string; order: Order; header: string; rows: OrderRow[]; path: string; warnings: Warning[];
  days: PlaceDay[]; questions: QuestionCard[]; drafts: DraftCard[]; counts: [number, number, number, number]; next: string;
};
/** A reply waiting in the device queue (same shape as the client's outbox payload). */
export type QueuedReply = { replyTo?: unknown; text?: unknown };

const meta = (d: Dictation): { question?: string; replyTo?: string } => {
  try { return JSON.parse(d.result ?? '{}'); } catch { return {}; }
};

/** The reply that answers question `d`, unless its effect was taken back with “Geri al”. */
export function answerOf(d: Dictation, dictations: Dictation[], outbox: QueuedReply[], changes: Change[]): Answer | null {
  const local = outbox.find(p => p.replyTo === d.id);
  if (local) return { text: String(local.text ?? ''), pending: true };
  for (const r of dictations) {
    if (meta(r).replyTo !== d.id && !r.raw.includes(`Yanıt (${d.id})`)) continue;
    if (!['done', 'question'].includes(r.status)) continue;
    const change = changes.find(c => c.sourceId === r.id);
    if (change && change.ops.every(o => o.undone)) continue;
    return { text: r.raw, pending: false, change, at: r.created_at };
  }
  return null;
}

/** Berthier's open questions: asked, and not answered (or the answer was taken back). */
export function pendingQuestions(dictations: Dictation[], outbox: QueuedReply[], changes: Change[]) {
  return dictations.filter(d => (d.status === 'question' || d.status === 'answered') && !answerOf(d, dictations, outbox, changes));
}

const PREP_START: Partial<Record<EventKind, number>> = { exam: 10, quiz: 3, presentation: 7, assignment: 7, application: 28 };
const LEAD: Partial<Record<EventKind, [string, string]>> = {
  exam: ['Sınav', 'Sınava'], quiz: ['Quiz', 'Quize'], presentation: ['Sunum', 'Sunuma'], assignment: ['Teslim', 'Teslime'], application: ['Son başvuru', 'Son başvuruya'],
};
const span = (e: CalendarEvent) => (e.time ?? '') + (e.endTime ? '–' + e.endTime : '');

/** “Son iade günü yarın.”, “Enzim kinetiği sunumu Pzt 5 Eki 10:00.” */
function datedSentence(e: CalendarEvent, days: number) {
  const when = days === 0 ? 'bugün' : days === 1 ? 'yarın' : shortDay(e.date!);
  return `${e.title} ${when}${e.time ? ' ' + e.time : ''}.`;
}

const sentence = (s: string) => /[.!?…]$/.test(s.trim()) ? s.trim() : s.trim() + '.';
/** “laboratuvar defteri, …” → “Laboratuvar defteri, …”; words like “pH” keep their case. */
const capital = (s: string) => /^\p{Ll}\p{Ll}/u.test(s) ? s[0].toLocaleUpperCase('tr-TR') + s.slice(1) : s;

/** Preparation that is running out: in the last week, in the second half of its preparation window, and
 *  with a larger share of the work left than of the time. Applications count documents, others plan moves. */
function prepWarning(s: State, e: CalendarEvent, today: string): Omit<Warning, 'seen'> | null {
  const lead = LEAD[e.kind];
  if (!lead || e.cancelled || !e.date || e.weekly) return null;
  const left = daysBetween(today, e.date), start = e.prepDays ?? s.prepDefaults?.[e.kind] ?? PREP_START[e.kind] ?? 7;
  if (left < 0 || left > YAKLASAN || (start > 0 && left / start > 0.5)) return null;
  const docs = e.kind === 'application' ? e.documents : [];
  const moves = Object.values(s.fronts).flatMap(f => f.moves).filter(m => m.eventId === e.id && !m.removedAt);
  const total = docs.length || moves.length;
  const done = docs.length ? docs.filter(d => d.status === 'ready' || d.status === 'uploaded').length : moves.filter(m => m.doneAt).length;
  if (!total || done >= total || (total - done) / total <= (start > 0 ? left / start : 0)) return null;
  const front = e.frontId ? s.fronts[e.frontId] : undefined;
  const when = left === 0 ? `${lead[0]} bugün.` : left === 1 ? `${lead[0]} yarın.` : `${lead[1]} ${left} gün kaldı.`;
  const status = docs.length
    ? done ? `Gerekli ${total} belgeden ${done}’${possessive(done)} hazır.` : `Gerekli ${total} belgenin hiçbiri henüz hazır değil.`
    : done ? `Hazırlık planındaki ${total} hamleden ${done}’${possessive(done)} tamamlandı.` : `Hazırlık planındaki ${total} hamlenin hiçbiri henüz tamamlanmadı.`;
  // An application is named by its institution (“ERASMUS+”), other preparations by their front.
  return {
    id: `prep:${e.id}:${e.date}`, kind: 'prep', label: 'HAZIRLIK DARALIYOR', meta: upper((e.kind === 'application' && e.institution.trim()) || front?.title || e.title),
    text: `${when} ${status}`, action: docs.length ? 'Belgeleri gör' : 'Hazırlık planını gör', event: e,
  };
}

/** Seen warnings stay in today's report (dimmed, with “Geri al”); on later days they drop out. */
const seenEarlier = (seenAt: string | undefined, day: string) => !!seenAt && dayKey(new Date(seenAt)) !== day;

/**
 * @param openedAt when the report was first opened today; the header says it was prepared then.
 * @param outbox replies still waiting in the device queue, so an answer shows at once.
 */
export function buildReport(s: State, dictations: Dictation[], outbox: QueuedReply[] = [], now = new Date(), openedAt?: string): Report {
  const day = dayKey(now), cal = calendarDay(now), order = s.orders[day] ?? propose(s, day);
  const events = Object.values(s.events ?? {});
  const frontTitle = (e: CalendarEvent) => (e.frontId ? s.fronts[e.frontId]?.title : undefined);

  // I · Günün emri
  const rows: OrderRow[] = order.slots.flatMap((x, i) => {
    const f = s.fronts[x.frontId];
    if (!f) return [];
    const next = nextDated(s, f.id, cal), days = next?.days ?? null;
    const tone: Tone = x.doneAt ? 'done' : f.status === 'held' || days == null ? 'calm' : days <= KRITIK ? 'crit' : days <= YAKLASAN ? 'near' : 'calm';
    const current = f.moves.find(m => m.id === x.moveId);
    const reason = current?.prerequisiteReason ?? (next && x.reason === DATED_REASON ? '' : x.reason);
    const why = x.doneAt
      ? `Bugün ${atTime(clockText(x.doneAt))} tamamlandı.`
      : [next ? datedSentence(next.event, next.days) : '', reason, f.type === 'lane' && f.where ? sentence(`Kaldığın yer: ${f.where}`) : ''].filter(Boolean).join(' ');
    return [{
      frontId: f.id, num: x.doneAt ? '✓' : pad(i + 1), head: `${f.title} · ${REGIONS[f.type].name}`, move: x.text, why,
      chip: days == null ? 'TARİHSİZ' : days === 0 ? 'BUGÜN' : `${days} GÜN`, tone, region: REGIONS[f.type].name,
    }];
  });
  const regions = rows.map(r => r.region).filter((r, i, all) => i === 0 || all[i - 1] !== r);
  const path = 'Güzergâh: ' + ['Karargâh', ...regions].join(' → ');

  // II · Uyarılar: hard conflicts, then preparations that are running out.
  const hard = conflicts(events, cal).filter(c => c.severity === 'hard');
  const warnings: Warning[] = [];
  for (const c of hard) {
    // Seen before today (or before the report existed, without a time) means it is no longer news.
    const seen = !!s.seenConflicts?.includes(c.id), seenAt = s.seenWarnings?.[c.id];
    if (seen && (!seenAt || seenEarlier(seenAt, day))) continue;
    // A one-off item is named first against a weekly one (“14:00 randevu, 13:00–16:00 lab ile çakışıyor”).
    const [first, second] = c.a.weekly !== c.b.weekly ? (c.a.weekly ? [c.b, c.a] : [c.a, c.b]) : [c.move, c.move === c.a ? c.b : c.a];
    const caught = s.conflictCaughtAt?.[c.id];
    const caughtText = !caught ? '' : now.getTime() - Date.parse(caught) < 86400000 ? upper(atTime(clockText(caught))) + ' YAKALANDI' : 'YAKALANDI · ' + upper(dayMonth(calendarDay(new Date(caught))));
    warnings.push({
      id: c.id, kind: 'conflict', label: 'SAAT ÇAKIŞMASI', meta: seen ? 'GÖRÜLDÜ' : caughtText, seen,
      text: `${shortDay(c.a.date!)} ${span(first)} ${first.title}, ${span(second)} ${second.title} ile çakışıyor.`,
      action: 'Başka saat için mail taslağı', conflict: c,
    });
  }
  for (const e of events.filter(e => e.date && e.date >= cal).sort((a, b) => a.date!.localeCompare(b.date!))) {
    const w = prepWarning(s, e, cal);
    if (!w) continue;
    const seenAt = s.seenWarnings?.[w.id];
    if (seenEarlier(seenAt, day)) continue;
    warnings.push({ ...w, seen: !!seenAt, meta: seenAt ? 'GÖRÜLDÜ' : w.meta });
  }

  // III · Bugün ve yarın: places to be, with what to bring. Class sessions are routine and stay out.
  const located = events.filter(e => e.location.trim() && e.kind !== 'class');
  const days: PlaceDay[] = ([['BUGÜN', cal], ['YARIN', addDays(cal, 1)]] as const).map(([label, d]) => {
    const when = `${label} · ${upper(shortDay(d))}`;
    return {
      when,
      places: occurrences(located, d, d).map(e => ({
        when: when + (e.time ? ' · ' + e.time : ''), title: e.location.trim(),
        context: [frontTitle(e), e.title].filter(Boolean).join(' · '), bring: capital(e.bring.join(', ')), event: e,
      })),
    };
  });

  // IV · Kararını bekleyenler: Berthier's questions (answered ones stay today with “Geri al”) and drafts.
  const questions: QuestionCard[] = dictations.filter(d => d.status === 'question' || d.status === 'answered').flatMap(d => {
    const answer = answerOf(d, dictations, outbox, s.changes);
    if (answer && !answer.pending && (!answer.at || dayKey(new Date(answer.at)) !== day)) return [];
    const question = meta(d).question ?? '', front = d.context ? s.fronts[d.context]?.title : undefined, input = questionInput(question);
    return [{ dictation: d, label: front ? `SORU · ${upper(front)}` : 'SORU', question, choices: input.choices, input: input.type, answer }];
  });
  // The only drafts Berthier prepares are conflict mails; a seen conflict's draft is no longer waiting.
  const drafts: DraftCard[] = hard.filter(c => !s.seenConflicts?.includes(c.id)).map(c => ({
    conflict: c, label: 'MAİL TASLAĞI · ' + upper(frontTitle(c.move) ?? c.move.title),
    text: `${c.move.title} için saat değişikliği ricası taslağı hazır.`,
  }));

  const opened = openedAt ?? s.metrics?.reportOpenedAt?.[day] ?? now.toISOString();
  return {
    day, order, rows, path, warnings, days, questions, drafts,
    header: `${longDay(day)} · ${upper(atTime(clockText(opened)))} HAZIRLANDI`,
    counts: [rows.length, warnings.length, days.reduce((n, d) => n + d.places.length, 0), questions.length + drafts.length],
    next: `RAPORUN SONU · SIRADAKİ RAPOR ${upper(shortDay(addDays(day, 1)))} ${s.rhythm?.report ?? REPORT_TIME}`,
  };
}

// Defter (design 1h) and the full-screen weekly review (1j): when the review is due, what its card says,
// which fronts the first step shows and which decision each got. Read-only; the review itself is driven by
// the existing commands (reviewStart, reviewStep, reviewContinue, status, setup, reviewFinish).

import { RHYTHM, type Dictation, type Front, type State } from './domain';
import { addDays, calendarDay, conflicts, occurrences, type CalendarEvent } from './calendar';
import { clockText } from './expedition/camps';
import { pendingIdeas, staleFronts } from './research';
import { dayMonth, shortDay, upper } from './turkish';

/** The saved review time (Tercihler › Ritim; Sunday 20:00 Istanbul unless changed). */
export type ReviewTime = { day: number; time: string };
export const REVIEW_TIME: ReviewTime = { day: RHYTHM.reviewDay, time: RHYTHM.reviewTime };
export const reviewTimeOf = (s: State): ReviewTime => s.rhythm ? { day: s.rhythm.reviewDay, time: s.rhythm.reviewTime } : REVIEW_TIME;
const DAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
export const reviewTimeText = (r: ReviewTime) => `${DAYS[r.day]} ${r.time}`;

const istanbul = (day: string, time: string) => new Date(`${day}T${time}:00+03:00`);

/** The scheduled review that has most recently passed, and the next one. */
export function reviewSchedule(now: Date, r: ReviewTime = REVIEW_TIME) {
  const today = calendarDay(now), weekday = new Date(today + 'T12:00:00Z').getUTCDay();
  let last = addDays(today, -((weekday - r.day + 7) % 7));
  if (istanbul(last, r.time) > now) last = addDays(last, -7);
  return { last: istanbul(last, r.time), next: istanbul(addDays(last, 7), r.time), nextDay: addDays(last, 7) };
}

/** The review card also shows on Karargâh while a review is unfinished, and for a day and a half after the
 *  scheduled time unless a review was completed shortly before it (doing it early counts). */
export function reviewDue(s: State, now: Date, r: ReviewTime = reviewTimeOf(s)) {
  if (s.review && !s.review.completedAt) return true;
  const { last } = reviewSchedule(now, r);
  if (now.getTime() - last.getTime() > 36 * 3600000) return false;
  const done = s.review?.completedAt ? Date.parse(s.review.completedAt) : 0;
  return done < last.getTime() - 2 * 86400000;
}

export const STEPS = [
  { tag: 'BAYAT', title: 'Bayat cepheler' },
  { tag: 'DEPO', title: 'Fikir deposu' },
  { tag: 'KULVAR', title: 'Aktif kulvarlar' },
  { tag: 'UFUK', title: 'Ufuk' },
  { tag: 'ÖZET', title: 'Özet' },
] as const;

export type ReviewCard = { open: boolean; label: string; when: string; title: string; meta: string; action: string };

/** “HAFTALIK TEFTİŞ · YARIN 20:00 · Haritaya birlikte bakalım. · 5 adım · 2 bayat cephe · 3 yeni fikir”. */
export function reviewCard(s: State, now: Date, r: ReviewTime = reviewTimeOf(s)): ReviewCard {
  const stale = staleFronts(s, now.getTime()).length, ideas = pendingIdeas(s).length;
  const counts = [stale ? `${stale} bayat cephe` : 'bayat cephe yok', ideas ? `${ideas} yeni fikir` : 'yeni fikir yok'];
  if (s.review && !s.review.completedAt) {
    const step = s.review.step;
    return { open: true, label: 'HAFTALIK TEFTİŞ', when: `ADIM ${step + 1} / ${STEPS.length}`, title: 'Kaldığın yerden devam et.', meta: [STEPS[step].title, ...counts].join(' · '), action: 'Devam et' };
  }
  const today = calendarDay(now), { nextDay } = reviewSchedule(now, r);
  const day = nextDay === today ? 'BUGÜN' : nextDay === addDays(today, 1) ? 'YARIN' : upper(shortDay(nextDay));
  return { open: false, label: 'HAFTALIK TEFTİŞ', when: reviewDue(s, now, r) ? 'ZAMANI GELDİ' : `${day} ${r.time}`, title: 'Haritaya birlikte bakalım.', meta: [`${STEPS.length} adım`, ...counts].join(' · '), action: 'Şimdi başlat' };
}

export type Decision = 'continue' | 'hold' | 'close';
const DECIDED: Record<string, Decision> = { 'sürdür': 'continue', aktif: 'continue', bekletildi: 'hold', 'kapatıldı': 'close' };

/** The decision recorded for a front in the open review (the last one wins), from the review's own log. */
export function decisionOf(s: State, f: Front): Decision | undefined {
  const log = s.review && !s.review.completedAt ? s.review.decisions : [];
  for (let i = log.length - 1; i >= 0; i--) {
    const d = log[i];
    if (d.startsWith(f.title + ': ')) return DECIDED[d.slice(f.title.length + 2)];
  }
  return undefined;
}

/** Step 1: the stale fronts, and the ones already decided in this review (deciding touches a front, so it
 *  would otherwise disappear). A stable order, so a card does not move when it is decided. */
export function reviewFronts(s: State, now: Date) {
  const stale = new Set(staleFronts(s, now.getTime()).map(f => f.id));
  return Object.values(s.fronts)
    .filter(f => stale.has(f.id) || decisionOf(s, f))
    .sort((a, b) => a.title.localeCompare(b.title, 'tr'))
    .map(f => ({ front: f, decision: decisionOf(s, f), days: stale.has(f.id) ? Math.floor((now.getTime() - Date.parse(f.touched)) / 86400000) : null }));
}

/** Step 4: what the review needs from the horizon, not the whole of it. */
export function horizonBrief(s: State, now: Date) {
  const today = calendarDay(now), all = Object.values(s.events ?? {}).filter(e => !e.cancelled);
  const items = occurrences(all, today, addDays(today, 13)).filter(e => e.kind !== 'class' && !e.weekly);
  const unseen = conflicts(all, today).filter(c => c.severity === 'hard' && !s.seenConflicts?.includes(c.id));
  const moves = (e: CalendarEvent) => Object.values(s.fronts).flatMap(f => f.moves).filter(m => m.eventId === e.id);
  const rows = items.map(e => { const m = moves(e); return { event: e, when: upper(shortDay(e.date!)) + (e.time ? ' ' + e.time : ''), done: m.filter(x => x.doneAt).length, total: m.length }; });
  return { items: rows, conflicts: unseen, unprepared: rows.filter(r => r.total > 0 && r.done === 0).length };
}

/** Defter's change-log row: “Son: Hamle tamamlandı · 10:12 · 1 bekleyen”. */
export function ledgerLine(s: State, dictations: Dictation[], outbox: { id: string }[], now: Date) {
  const last = [...s.changes].reverse().find(c => !c.ops.every(o => o.undone));
  const waiting = outbox.length + dictations.filter(d => d.status === 'failed' && !outbox.some(x => x.id === d.id)).length;
  const at = last ? (calendarDay(new Date(last.at)) === calendarDay(now) ? clockText(last.at) : dayMonth(calendarDay(new Date(last.at)))) : '';
  return [last ? `Son: ${last.label} · ${at}` : 'Henüz kayıt yok', waiting ? `${waiting} bekleyen` : ''].filter(Boolean).join(' · ');
}

/** Defter's depot row: “7 kalem · 1 sahipsiz”. */
export function depotLine(s: State) {
  const stored = Object.values(s.ideas ?? {}).filter(i => i.status === 'stored');
  const orphan = stored.filter(i => !i.laneId || s.fronts[i.laneId]?.status === 'closed').length;
  return stored.length ? `${stored.length} kalem${orphan ? ` · ${orphan} sahipsiz` : ''}` : 'Fikirlerin, okumaların ve soruların burada bekler.';
}

// Rutinler (design 4 Ekim, “Berthier Rutinler”: A1–A7, B1–B4, D3). A routine repeats: it is not a move and
// never joins the order, the map or Ufuk. It comes in with one intent (“haftada 4”); Berthier first only
// records (gözlem, 14 days), then mirrors back what it saw as a weekly pattern the user approves. The week
// turns on Monday 04:00 (dayKey); what counts is the week's number, never a streak.
// Pure functions over the saved state, and `routineAct`, the reducer of the routine commands.

import { RHYTHM, type State, dayKey, normalize, similarity, uid } from './domain';
import { addDays, daysBetween, occurrences, validDate, validTime } from './calendar';
import { DAY_NAMES, WD, accusative, andList, atTime, dayMonth, genitive, lowerFirst, minutesText, onDate, possessive, sinceTime, untilTime, upper } from './turkish';

export type RoutineStep = { key: string; title: string; offsetMin: number; activeMin: number; wait?: boolean };
export type Routine = {
  id: string; title: string;
  /** Sessions a week; every day = 7. */
  count: number;
  status: 'observing' | 'settled' | 'paused';
  /** observeFrom is a dayKey. */
  createdAt: string; observeFrom: string;
  /** What the user said when adding it, as said. */
  estimate?: { minutes?: number; time?: string };
  pattern?: { days: number[]; time: string; minutes: number; range?: [number, number]; after?: string; approvedAt: string };
  /** One way, in minutes. */
  travel?: number;
  steps?: RoutineStep[];
  /** Sessions are measured with the timer (true while learning). */
  timer: boolean;
  reminder: { on: boolean; leadMin: number; group?: 'a' | 'b' };
  /** The user's own reason, quoted from the raw dictation. */
  ownWords?: { text: string; show: boolean; sourceId: string };
  avoidDays?: number[];
  /** When a scaffold suggestion was declined (asked again after four weeks). */
  asked?: { reminderOff?: string; timerOff?: string };
};
export type Session = { id: string; routineId: string; day: string; start?: string; end: string; minutes: number; source: 'timer' | 'tap' | 'dictation' | 'review'; step?: string };
export type Skip = { routineId: string; day: string; at: string; slidTo?: string };
export type Running = { routineId: string; start: string; step?: string };
export type ReminderTrial = { startedAt: string; a: string[]; b: string[]; decidedAt?: string };

export const OBSERVE_DAYS = 14, LEAD_MIN = 10, CHAIN_GAP = 15;
const MIN = 60000, DECLINED_DAYS = 28;
const pad = (n: number) => String(n).padStart(2, '0');

// ── Time ──

/** “22:41”, Istanbul (UTC+3, as dayKey). */
export const clock = (iso: string) => new Date(Date.parse(iso) + 3 * 3600000).toISOString().slice(11, 16);
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
/** Minutes into the workday, which starts at 04:00: 00:30 comes after 23:00. */
export const dayMin = (t: string) => (toMin(t) - 240 + 1440) % 1440;
const fromDayMin = (m: number) => { const t = ((Math.round(m) + 240) % 1440 + 1440) % 1440; return pad(Math.floor(t / 60)) + ':' + pad(t % 60); };
/** The moment `time` on workday `day`; 00:00–03:59 belong to the night after it. */
export function at(day: string, time: string) { return new Date(`${time < '04:00' ? addDays(day, 1) : day}T${time}:00+03:00`); }
export const weekday = (day: string) => new Date(day + 'T12:00:00Z').getUTCDay();
export const weekStart = (day: string) => addDays(day, -((weekday(day) + 6) % 7));
export const weekOf = (day: string) => Array.from({ length: 7 }, (_, i) => addDays(weekStart(day), i));
/** Monday first, as the chips: PZT … PAZ. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

// ── Numbers ──

export function quantile(xs: number[], q: number) {
  if (!xs.length) return NaN;
  const a = [...xs].sort((x, y) => x - y), i = (a.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
  return a[lo] + (a[hi] - a[lo]) * (i - lo);
}
export const median = (xs: number[]) => quantile(xs, 0.5);
const round5 = (n: number) => Math.max(5, Math.round(n / 5) * 5);
/** A range as written: to 5 minutes for longer routines, to the minute for short ones; none when it collapses. */
function spread(lo: number, hi: number, m: number): [number, number] | null {
  const r = (x: number) => m >= 20 ? round5(x) : Math.max(1, Math.round(x)), a = r(lo), b = r(hi);
  return a < b ? [a, b] : null;
}

// ── Records ──

export const routinesOf = (s: State) => Object.values(s.routines ?? {});
export const sessionsOf = (s: State, id: string) => (s.sessions ?? []).filter(x => x.routineId === id);
export const startOf = (x: Session) => x.start ?? new Date(Date.parse(x.end) - x.minutes * MIN).toISOString();
/** A routine with steps counts the week with its last step. */
const counts = (r: Routine) => (x: Session) => !r.steps?.length || x.step === r.steps.at(-1)!.key;
export const doneOn = (s: State, r: Routine, day: string) => sessionsOf(s, r.id).filter(x => x.day === day && counts(r)(x));
export function weekDone(s: State, r: Routine, day: string) {
  const w = weekOf(day);
  return sessionsOf(s, r.id).filter(x => x.day >= w[0] && x.day <= w[6] && counts(r)(x)).length;
}
const skippedOn = (s: State, r: Routine, day: string) => (s.skips ?? []).some(k => k.routineId === r.id && k.day === day);
export const findRoutine = (s: State, title: string) => routinesOf(s).find(r => normalize(r.title) === normalize(title) || similarity(r.title, title) >= 0.6);
export const countText = (n: number) => n >= 7 ? 'her gün' : `haftada ${n}`;

// ── Duration: what was measured, never what was feared ──

export type Usual = { minutes: number | null; range: [number, number] | null; timed: number[]; n: number };

/** The routine's usual duration: the median of timed sessions (all sessions when none was timed), and a
 *  range when the spread is wide ((p90 − p10) > median / 2). Waiting steps take no time of the day. */
export function usual(s: State, r: Routine): Usual {
  if (r.steps?.length) {
    const parts = r.steps.filter(p => !p.wait).map(p => { const xs = sessionsOf(s, r.id).filter(x => x.step === p.key).map(x => x.minutes); return xs.length ? median(xs) : p.activeMin; });
    const timed = sessionsOf(s, r.id).filter(x => x.source === 'timer').map(x => x.minutes);
    return { minutes: Math.round(parts.reduce((a, b) => a + b, 0)), range: null, timed, n: sessionsOf(s, r.id).filter(counts(r)).length };
  }
  const all = sessionsOf(s, r.id), timed = all.filter(x => x.source === 'timer').map(x => x.minutes), pool = timed.length ? timed : all.map(x => x.minutes);
  if (!pool.length) {
    const said = r.estimate?.minutes !== undefined ? r.estimate.minutes + 2 * (r.travel ?? 0) : undefined;
    return { minutes: said ?? r.pattern?.minutes ?? null, range: r.pattern?.range ?? null, timed, n: 0 };
  }
  const m = Math.round(median(pool)), lo = quantile(pool, 0.1), hi = quantile(pool, 0.9);
  return { minutes: m, range: pool.length >= 3 && hi - lo > m / 2 ? spread(lo, hi, m) : null, timed, n: pool.length };
}
export const usualMinutes = (s: State, r: Routine) => usual(s, r).minutes;
/** “≈32 dk”, “30–90 dk”. */
export function durationText(s: State, r: Routine) {
  const u = usual(s, r);
  return u.range ? `${u.range[0]}–${u.range[1]} dk` : u.minutes !== null ? `≈${minutesText(u.minutes)}` : '';
}
export function durationChip(s: State, r: Routine) {
  const u = usual(s, r);
  return u.range ? `${u.range[0]}–${u.range[1]} DK` : u.minutes !== null ? `≈${minutesText(u.minutes).toLocaleUpperCase('tr-TR')}` : '';
}

// ── The week ──

/** Fixed items of Ufuk on a day (they keep their time; a routine slides around them). */
export const fixedOn = (s: State, day: string) => occurrences(Object.values(s.events ?? {}), day, day).filter(e => e.time);
function busyAt(s: State, day: string, time: string, minutes: number) {
  const a = dayMin(time), b = a + Math.max(minutes, 1);
  return fixedOn(s, day).some(e => { const x = dayMin(e.time!), y = e.endTime ? dayMin(e.endTime) : x + 60; return x < b && a < y; });
}

/** Planned weekdays missed at least twice in the last four full weeks: not proposed again, not slid onto. */
export function avoided(s: State, r: Routine, today: string): number[] {
  const out = new Set(r.avoidDays ?? []);
  if (r.pattern) {
    const since = dayKey(new Date(r.pattern.approvedAt)), misses = new Map<number, number>();
    for (let d = addDays(weekStart(today), -28); d < weekStart(today); d = addDays(d, 1)) {
      if (d < since || !r.pattern.days.includes(weekday(d)) || doneOn(s, r, d).length) continue;
      misses.set(weekday(d), (misses.get(weekday(d)) ?? 0) + 1);
    }
    for (const [d, n] of misses) if (n >= 2) out.add(d);
  }
  return [...out];
}

export type WeekPlan = { days: string[]; slid: Record<string, string>; upcoming: string[] };

/** This week's plan for a settled routine. A planned day skipped (“bugün değil”) or passed without a session
 *  slides to the first later day of the week that is not in the pattern, not an avoided weekday and has no
 *  fixed item at that time; with no such day it does not slide and the week ends as it is (3/4). `upcoming`
 *  keeps only as many open days as the week still needs. */
export function weekPlan(s: State, r: Routine, today: string): WeekPlan {
  const p = r.pattern;
  if (r.status !== 'settled' || !p) return { days: [], slid: {}, upcoming: [] };
  const week = weekOf(today), since = dayKey(new Date(p.approvedAt)), avoid = avoided(s, r, today), minutes = usualMinutes(s, r) ?? p.minutes;
  const done = (d: string) => doneOn(s, r, d).length > 0;
  const planned = new Set(week.filter(d => d >= since && p.days.includes(weekday(d)))), slid: Record<string, string> = {}, days: string[] = [];
  for (const d of week) {
    if (!planned.has(d)) continue;
    if (!skippedOn(s, r, d) && !(d < today && !done(d))) { days.push(d); continue; }
    const to = week.find(x => x > d && !planned.has(x) && !p.days.includes(weekday(x)) && !avoid.includes(weekday(x)) && !skippedOn(s, r, x) && !busyAt(s, x, p.time, minutes));
    if (to) { planned.add(to); slid[to] = slid[d] ?? d; }
  }
  const left = Math.max(0, r.count - weekDone(s, r, today));
  return { days, slid, upcoming: days.filter(d => d >= today && !done(d)).slice(0, left) };
}

/** “Pzt, Çar, Cmt, Paz”, “Her gün”, “Hafta içi her gün”. */
export function daysText(days: number[]) {
  const set = new Set(days);
  if (set.size === 7) return 'Her gün';
  if (set.size === 5 && [1, 2, 3, 4, 5].every(d => set.has(d))) return 'Hafta içi her gün';
  return WEEK_ORDER.filter(d => set.has(d)).map(d => WD[d]).join(', ');
}

// ── Bugün (A3) ──

export type RowTone = 'done' | 'next' | 'plan' | 'fixed' | 'skip' | 'running';
export type TodayRow = { key: string; ids: string[]; time: string; title: string; sub: string; chip: string; tone: RowTone };
export type TodayList = { rows: TodayRow[]; count: number; left: number; total: number; planned: boolean; next: TodayRow | null };

const SOURCE: Record<Session['source'], string> = { timer: 'Sayaçla', tap: 'Yaptım · süre tahmini', dictation: 'Dikteyle', review: 'Teftişte eklendi' };

/** Today's routines in time order: done sessions (real time and length; chained ones on one line), the running
 *  timer, what is planned, fixed items of Ufuk (muted) and, at the end, what was put off. While nothing is
 *  settled yet the list only records (A1). */
export function todayList(s: State, now: Date): TodayList {
  const d = dayKey(now), all = routinesOf(s), rows: (TodayRow & { at: number })[] = [];
  const settled = all.filter(r => r.status === 'settled' && r.pattern);
  const plans = new Map(settled.map(r => [r.id, weekPlan(s, r, d)]));
  const planned = settled.some(r => plans.get(r.id)!.days.includes(d) || skippedOn(s, r, d));
  let total = 0;
  // Done: real start and length. A routine that follows another (pattern.after) within 15 minutes shares its line.
  const done = (s.sessions ?? []).filter(x => x.day === d && s.routines?.[x.routineId]).sort((a, b) => startOf(a).localeCompare(startOf(b)));
  let last: { row: TodayRow & { at: number }; id: string; end: string; minutes: number } | null = null;
  for (const x of done) {
    const r = s.routines![x.routineId], step = r.steps?.find(p => p.key === x.step);
    total += x.minutes;
    const gap = last ? (Date.parse(startOf(x)) - Date.parse(last.end)) / MIN : Infinity;
    if (last && r.pattern?.after === last.id && gap >= -2 && gap <= CHAIN_GAP) {
      last.minutes += x.minutes; last.end = x.end; last.row.ids.push(r.id); last.row.title += ', ' + lowerFirst(r.title);
      last.row.chip = (planned ? '✓ ' : '') + minutesText(last.minutes).toLocaleUpperCase('tr-TR');
      last.id = r.id;
      continue;
    }
    const row = { key: 'done:' + x.id, ids: [r.id], time: clock(startOf(x)), title: r.title + (step ? ' · ' + lowerFirst(step.title) : ''), sub: planned ? '' : SOURCE[x.source] + (r.travel ? ' · yol dahil' : ''), chip: (planned ? '✓ ' : '') + minutesText(x.minutes).toLocaleUpperCase('tr-TR'), tone: 'done' as const, at: dayMin(clock(startOf(x))) };
    rows.push(row);
    last = { row, id: r.id, end: x.end, minutes: x.minutes };
  }
  let left = 0;
  const run = s.running && s.routines?.[s.running.routineId];
  if (run && s.running) {
    const elapsed = Math.max(0, Math.floor((now.getTime() - Date.parse(s.running.start)) / MIN));
    rows.push({ key: 'run', ids: [run.id], time: clock(s.running.start), title: run.title, sub: 'Sayaç sürüyor', chip: minutesText(elapsed).toLocaleUpperCase('tr-TR'), tone: 'running', at: dayMin(clock(s.running.start)) });
    left += Math.max(0, (usualMinutes(s, run) ?? 0) - elapsed);
  }
  // Planned and still open today; a routine that follows another one in today's list hangs under it (“↳”).
  const open = settled.filter(r => plans.get(r.id)!.upcoming.includes(d) && s.running?.routineId !== r.id).sort((a, b) => dayMin(a.pattern!.time) - dayMin(b.pattern!.time));
  const inList = new Set([...open.map(r => r.id), ...rows.flatMap(x => x.ids)]);
  let first = true;
  for (const r of open) {
    const parent = r.pattern!.after && inList.has(r.pattern!.after) ? s.routines![r.pattern!.after] : undefined;
    const minutes = usualMinutes(s, r) ?? r.pattern!.minutes, n = weekDone(s, r, d);
    left += minutes;
    const chained = !!parent && parent.id !== r.id;
    const sub = chained ? `${genitive(parent!.title)} ardından` : first ? `Sırada · ${n ? `bu hafta ${n}/${r.count}` : 'haftanın ilk seansı'}` : r.travel ? 'Yol dahil' : '';
    const parentRow = chained ? rows.find(x => x.ids.includes(parent!.id)) : undefined;
    rows.push({ key: 'plan:' + r.id, ids: [r.id], time: chained ? '↳' : r.pattern!.time, title: r.title, sub, chip: durationChip(s, r), tone: !chained && first ? 'next' : 'plan', at: chained ? (parentRow?.at ?? dayMin(parent!.pattern?.time ?? r.pattern!.time)) + 0.5 : dayMin(r.pattern!.time) });
    if (!chained) first = false;
  }
  if (planned) for (const e of fixedOn(s, d)) rows.push({ key: 'fixed:' + e.id + e.date, ids: [], time: e.time!, title: e.title, sub: e.endTime ? `Sabit · ${untilTime(e.endTime)} kadar` : 'Sabit', chip: '', tone: 'fixed', at: dayMin(e.time!) });
  rows.sort((a, b) => a.at - b.at);
  // Put off today: at the end, muted; no red, no cross.
  for (const r of settled) {
    if (!skippedOn(s, r, d)) continue;
    const k = (s.skips ?? []).find(x => x.routineId === r.id && x.day === d)!;
    rows.push({ key: 'skip:' + r.id, ids: [r.id], time: '—', title: r.title, sub: `Bugün değil · ${k.slidTo ? `${DAY_NAMES[weekday(k.slidTo)]} ${untilTime(r.pattern!.time)} kaydı` : 'bu hafta kaymadı'}`, chip: '', tone: 'skip', at: 9999 });
  }
  const count = new Set(rows.filter(x => x.tone !== 'skip' && x.tone !== 'fixed').flatMap(x => x.ids)).size;
  return { rows: rows.map(x => ({ key: x.key, ids: x.ids, time: x.time, title: x.title, sub: x.sub, chip: x.chip, tone: x.tone })), count, left: Math.round(left), total, planned, next: rows.find(x => x.tone === 'next') ?? null };
}

// ── Bu hafta (A1, A3) ──

export type WeekRow = { routine: Routine; sub: string; done: number; target: number };

export function weekRows(s: State, today: string): WeekRow[] {
  const rank = (r: Routine) => r.status === 'settled' && r.pattern ? dayMin(r.pattern.time) : 2000 + Date.parse(r.createdAt) / 1e12;
  return routinesOf(s).filter(r => r.status !== 'paused').sort((a, b) => rank(a) - rank(b)).map(r => {
    const done = weekDone(s, r, today), xs = sessionsOf(s, r.id);
    if (r.status === 'settled' && r.pattern) {
      const plan = weekPlan(s, r, today), moved = Object.keys(plan.slid).length > 0;
      const days = moved ? [...new Set(plan.days.map(weekday))] : r.pattern.days;
      return { routine: r, done, target: r.count, sub: `${moved ? 'Bu hafta ' : ''}${daysText(days)} · ${r.pattern.time}${r.travel ? ' · yol dahil' : ''}` };
    }
    const lastOne = [...xs].sort((a, b) => startOf(b).localeCompare(startOf(a)))[0], u = usual(s, r);
    const tail = !xs.length ? (r.observeFrom === today ? 'bugün eklendi' : 'henüz kayıt yok') : `son ${WD[weekday(lastOne.day)]} ${clock(startOf(lastOne))} · ${u.timed.length} ölçüm${u.minutes !== null && u.timed.length ? ', ' + durationText(s, r) : ''}`;
    return { routine: r, done, target: r.count, sub: `${countText(r.count).replace(/^./, c => c.toLocaleUpperCase('tr-TR'))} · ${tail}` };
  });
}

/** “5 – 11 EKİ · HAFTANIN 1. GÜNÜ”. */
export function weekLine(today: string) {
  const w = weekOf(today), a = dayMonth(w[0]).split(' '), b = dayMonth(w[6]).split(' ');
  const range = a[1] === b[1] ? `${a[0]} – ${b[0]} ${b[1]}` : `${a[0]} ${a[1]} – ${b[0]} ${b[1]}`;
  return upper(`${range} · haftanın ${w.indexOf(today) + 1}. günü`);
}

// ── Gözlem (A1) ──

/** The observation card while nothing is settled yet: day n of 14 and when the pattern will be proposed. */
export function observation(s: State, today: string) {
  const watching = routinesOf(s).filter(r => r.status === 'observing');
  if (!watching.length || routinesOf(s).some(r => r.status === 'settled')) return null;
  const from = watching.map(r => r.observeFrom).sort()[0], day = Math.min(OBSERVE_DAYS, daysBetween(from, today) + 1);
  const ready = addDays(from, OBSERVE_DAYS), proposeOn = addDays(ready, (8 - weekday(ready)) % 7);
  return { day, from, proposeOn, text: `Hangi gün, saat kaçta ve ne kadar sürdüğünü kayıtlardan öğreniyorum. ${onDate(proposeOn)} haftalık düzeni önereceğim. Bu sürede hatırlatma yok.`, cells: Array.from({ length: OBSERVE_DAYS }, (_, i) => { const c = addDays(from, i); return c < today ? 'past' : c === today ? 'today' : 'future'; }) };
}

// ── Ayna: the weekly pattern proposal (A2) ──

const needed = (r: Routine) => r.count >= 7 ? 7 : Math.max(3, 1.5 * r.count);

/** A routine is proposed after at least 14 days and max(3, 1.5 × count) sessions (7 for every day). The card
 *  shows from Monday 04:00 on, or in the weekly review. */
export function readyToPropose(s: State, r: Routine, today: string, inReview = false) {
  if (r.status !== 'observing') return false;
  const asOf = inReview ? addDays(today, 1) : weekStart(today);
  return daysBetween(r.observeFrom, asOf) >= OBSERVE_DAYS && sessionsOf(s, r.id).filter(x => x.day < asOf && counts(r)(x)).length >= needed(r);
}

/** Which routine `r` follows: one whose session ended at most 15 minutes before r's started, on 3 days or more. */
export function chainOf(s: State, r: Routine): string | undefined {
  const tally = new Map<string, number>();
  for (const x of sessionsOf(s, r.id)) {
    const seen = new Set<string>();
    for (const y of s.sessions ?? []) {
      if (y.routineId === r.id || y.day !== x.day || seen.has(y.routineId)) continue;
      const gap = (Date.parse(startOf(x)) - Date.parse(y.end)) / MIN;
      if (gap >= -2 && gap <= CHAIN_GAP) { seen.add(y.routineId); tally.set(y.routineId, (tally.get(y.routineId) ?? 0) + 1); }
    }
  }
  const best = [...tally].filter(([id, n]) => n >= 3 && s.routines?.[id] && s.routines[id].pattern?.after !== r.id).sort((a, b) => b[1] - a[1])[0];
  return best?.[0];
}

export type Proposal = { routine: Routine; days: number[]; time: string; minutes: number | null; range: [number, number] | null; after?: string; tried: number[]; n: number; text: string; compact: boolean };

/** What Berthier saw, in one sentence: the most frequent `count` weekdays of the last two to four weeks
 *  (avoided days left out, the nearest frequent day instead), the median start rounded to 15 minutes and the
 *  usual duration. */
export function mirror(s: State, r: Routine, today: string): Proposal {
  const from = addDays(today, -28), xs = sessionsOf(s, r.id).filter(x => x.day >= from && x.day < addDays(today, 1) && counts(r)(x));
  const perDay = new Map<number, number>();
  for (const day of new Set(xs.map(x => x.day))) perDay.set(weekday(day), (perDay.get(weekday(day)) ?? 0) + 1);
  const avoid = avoided(s, r, today), n = Math.min(7, r.count);
  const order = WEEK_ORDER.filter(d => !avoid.includes(d)).sort((a, b) => (perDay.get(b) ?? 0) - (perDay.get(a) ?? 0) || WEEK_ORDER.indexOf(a) - WEEK_ORDER.indexOf(b));
  const days = (n >= 7 ? WEEK_ORDER : order.slice(0, n)).slice().sort((a, b) => WEEK_ORDER.indexOf(a) - WEEK_ORDER.indexOf(b));
  const starts = xs.map(x => dayMin(clock(startOf(x))));
  const time = starts.length ? fromDayMin(Math.round(median(starts) / 15) * 15) : r.pattern?.time ?? r.estimate?.time ?? '20:00';
  const u = usual(s, r), tried = [...perDay.keys()].filter(d => !days.includes(d));
  const when = days.length === 7 ? `Her gün ${atTime(time)}` : daysText(days) === 'Hafta içi her gün' ? `Hafta içi her gün ${atTime(time)}` : `Genelde ${andList(WEEK_ORDER.filter(d => days.includes(d)).map(d => WD[d]))} ${atTime(time)}`;
  const text = u.range ? `${when}, ${u.range[0]}–${u.range[1]} dk.` : u.minutes !== null ? `${when} yapıyorsun; ≈${minutesText(u.minutes)} sürüyor.` : `${when} yapıyorsun.`;
  return { routine: r, days, time, minutes: u.minutes, range: u.range, after: chainOf(s, r), tried, n: xs.length, text, compact: days.length === 7 || daysText(days) === 'Hafta içi her gün' };
}

export function proposals(s: State, today: string, inReview = false) {
  return routinesOf(s).filter(r => readyToPropose(s, r, today, inReview)).map(r => mirror(s, r, today));
}

// ── Sayaç ──

export type RunningInfo = { routine: Routine; start: string; elapsed: number; overdue: boolean; step?: RoutineStep };

/** The running timer; it is overdue at twice the usual duration (asked on the next opening: “Hâlâ sürüyor mu?”). */
export function runningInfo(s: State, now: Date): RunningInfo | null {
  const run = s.running, r = run ? s.routines?.[run.routineId] : undefined;
  if (!run || !r) return null;
  const elapsed = Math.max(0, (now.getTime() - Date.parse(run.start)) / MIN), step = r.steps?.find(p => p.key === run.step);
  return { routine: r, start: run.start, elapsed, overdue: elapsed > 2 * (usualMinutes(s, r) ?? 60), step };
}

// ── Hatırlatma (B1, B2) ──

export type Reminder = { key: string; routineId: string; title: string; body: string; words: string | null; from: string; until: string; quiet: boolean; timer: boolean };

function inQuiet(time: string, s: State) {
  const r = s.rhythm ?? RHYTHM, t = toMin(time), a = toMin(r.quietFrom), b = toMin(r.quietTo);
  return a <= b ? t >= a && t < b : t >= a || t < b;
}

/** The reminder of the moment, for the in-app card now and the notification branch later: one per block, once a
 *  routine a day, from the block's time − lead (10 minutes; travel + 10) to the block's end. Off while observing;
 *  gone once done or put off. Title “<Rutin> · <saat>”; body the week's number, the chained routine and the
 *  length, “<saat> boş” on a day with fixed items; the user's own words on a second line when shown. `quiet`:
 *  inside the quiet hours (no push, only in the app). `hidden` holds the keys dismissed for the day. */
export function reminderFor(s: State, now: Date, hidden: string[] = []): Reminder | null {
  const d = dayKey(now), t = now.getTime(), out: Reminder[] = [];
  const settled = routinesOf(s).filter(r => r.status === 'settled' && r.pattern);
  const today = new Set(settled.filter(r => weekPlan(s, r, d).upcoming.includes(d)).map(r => r.id));
  for (const id of today) {
    const r = s.routines![id], p = r.pattern!;
    if (!r.reminder.on || s.running?.routineId === id || (p.after && today.has(p.after))) continue;
    const key = `${id}:${d}`, block = at(d, p.time).getTime(), lead = r.travel ? r.travel + LEAD_MIN : r.reminder.leadMin;
    const next = settled.find(x => x.pattern!.after === id && today.has(x.id));
    const minutes = (usualMinutes(s, r) ?? p.minutes) + (next ? usualMinutes(s, next) ?? next.pattern!.minutes : 0);
    const from = block - lead * MIN, until = block + minutes * MIN;
    if (t < from || t > until || hidden.includes(key)) continue;
    const n = weekDone(s, r, d), u = usual(s, r);
    const length = next ? `≈${minutesText(minutes)}` : u.range ? `${u.range[0]}–${u.range[1]} dk` : `≈${minutesText(minutes)}`;
    const body = [n ? `Bu hafta ${n}/${r.count}` : 'Haftanın ilk seansı', next ? `ardından ${lowerFirst(next.title)}` : '', length, fixedOn(s, d).length ? `${p.time} boş` : ''].filter(Boolean).join(' · ');
    out.push({ key, routineId: id, title: `${r.title} · ${p.time}`, body, words: r.ownWords?.show ? `“${r.ownWords.text.replace(/^[“"]|[”"]$/g, '')}”` : null, from: new Date(from).toISOString(), until: new Date(until).toISOString(), quiet: inQuiet(clock(new Date(from).toISOString()), s), timer: r.timer });
  }
  return out.sort((a, b) => a.from.localeCompare(b.from))[0] ?? null;
}

// ── İskele (B4) ──

export type Scaffold = { routine: Routine; what: 'reminder' | 'timer'; title: string; text: string; yes: string; no: string };

const declined = (iso: string | undefined, today: string) => !!iso && daysBetween(dayKey(new Date(iso)), today) < DECLINED_DAYS;

/** Scaffolding comes down: the reminder of a routine that has held its pattern for three weeks, met its number
 *  every week and started before the reminder in ≥ 75 % of the sessions; the timer of a routine with ≥ 8
 *  measurements spread less than a quarter of the median. A declined suggestion waits four weeks. */
export function scaffolds(s: State, today: string) {
  const items: Scaffold[] = [], notes: string[] = [];
  const settled = routinesOf(s).filter(r => r.status === 'settled' && r.pattern);
  for (const r of settled) {
    const p = r.pattern!, since = dayKey(new Date(p.approvedAt));
    if (r.reminder.on && daysBetween(since, today) >= 21 && !declined(r.asked?.reminderOff, today)) {
      const weeks = [1, 2, 3].map(i => addDays(weekStart(today), -7 * i));
      const met = weeks.every(w => weekDone(s, r, w) >= r.count);
      const xs = sessionsOf(s, r.id).filter(x => x.day >= weeks[2] && x.day < weekStart(today) && counts(r)(x));
      const lead = ((r.travel ?? 0) + LEAD_MIN) * MIN, early = xs.filter(x => Date.parse(startOf(x)) < at(x.day, p.time).getTime() - lead).length;
      if (met && xs.length && early / xs.length >= 0.75) items.push({ routine: r, what: 'reminder', title: `${r.title} kendi saatinde oluyor.`, text: `Son ${xs.length} seansın ${early}’${possessive(early)} hatırlatmadan önce başladı. Hatırlatmayı kapatalım mı? İstersen yeniden açarsın.`, yes: 'Hatırlatmayı kapat', no: 'Kalsın' });
    }
    const u = usual(s, r);
    if (r.timer && u.timed.length >= 8) {
      const m = median(u.timed), lo = Math.round(quantile(u.timed, 0.1)), hi = Math.round(quantile(u.timed, 0.9));
      if (hi - lo <= m / 4) { if (!declined(r.asked?.timerOff, today)) items.push({ routine: r, what: 'timer', title: `${genitive(r.title)} süresi oturdu.`, text: `${u.timed.length} ölçüm, ${lo}–${hi} dk. Sayaç yerine “Yaptım” yeter; ≈${Math.round(m)} dk yazılır.`, yes: 'Tek dokunuşa geç', no: 'Sayaç kalsın' }); }
      else if (hi - lo > m / 2 && spread(lo, hi, m)) notes.push(`${genitive(r.title)} süresi değişiyor (${spread(lo, hi, m)!.join('–')} dk); onda sayaç kalıyor.`);
    }
  }
  // At most two suggestions at a time, the reminder ones first; the rest come up on a later day.
  const first = settled.map(r => dayKey(new Date(r.pattern!.approvedAt))).sort()[0];
  return { items: items.sort((a, b) => Number(b.what === 'reminder') - Number(a.what === 'reminder')).slice(0, 2), notes: notes.slice(0, 1), weeks: first ? Math.floor(daysBetween(first, today) / 7) : 0 };
}

// ── Deneme (“Yarısına”) ──

/** Two weeks after a half-reminded start, the two groups' sessions side by side; no comment. */
export function trialResult(s: State, today: string) {
  const t = s.reminderTrial;
  if (!t || t.decidedAt) return null;
  const start = dayKey(new Date(t.startedAt)), end = addDays(start, 13);
  if (daysBetween(start, today) < 14) return null;
  const tally = (ids: string[]) => {
    const rs = ids.map(id => s.routines?.[id]).filter((r): r is Routine => !!r);
    return { routines: rs.length, done: rs.reduce((n, r) => n + sessionsOf(s, r.id).filter(x => x.day >= start && x.day <= end && counts(r)(x)).length, 0), target: rs.reduce((n, r) => n + 2 * r.count, 0) };
  };
  return { a: tally(t.a), b: tally(t.b) };
}

/** “Yarısına”: routines sorted by time of day and number a week, alternately into two groups; group a reminded. */
export function trialGroups(rs: Routine[]) {
  const sorted = [...rs].sort((x, y) => dayMin(x.pattern?.time ?? '12:00') - dayMin(y.pattern?.time ?? '12:00') || y.count - x.count || x.title.localeCompare(y.title, 'tr'));
  return { a: sorted.filter((_, i) => i % 2 === 0).map(r => r.id), b: sorted.filter((_, i) => i % 2 === 1).map(r => r.id) };
}

// ── Teftiş (D3) ──

/** The week's numbers, those furthest from their number first. */
export function reviewRows(s: State, today: string) {
  return routinesOf(s).filter(r => r.status !== 'paused').map(r => ({ routine: r, done: weekDone(s, r, today), target: r.count })).sort((a, b) => a.done / a.target - b.done / b.target || a.routine.title.localeCompare(b.routine.title, 'tr'));
}

/** A settled routine whose planned weekday keeps being missed: the nearest frequent day instead. */
export function slideSuggestions(s: State, today: string) {
  return routinesOf(s).filter(r => r.status === 'settled' && r.pattern && r.count < 7).flatMap(r => {
    const bad = avoided(s, r, today).filter(d => r.pattern!.days.includes(d));
    if (!bad.length) return [];
    const m = mirror(s, r, today), days = [...new Set([...r.pattern!.days.filter(d => !bad.includes(d)), ...m.days])].slice(0, r.count);
    const added = days.filter(d => !r.pattern!.days.includes(d));
    if (!added.length) return [];
    return [{ routine: r, days: days.sort((a, b) => WEEK_ORDER.indexOf(a) - WEEK_ORDER.indexOf(b)), text: `${DAY_NAMES[bad[0]]} son haftalarda iki kez kaçtı; yerine ${accusative(DAY_NAMES[added[0]])} öneriyorum.` }];
  });
}

// ── Komutlar ──

export type RoutineCommand = {
  kind: string; routineId?: string; targetId?: string; stepKey?: string; day?: string; start?: string; end?: string; minutes?: number; sessionId?: string;
  days?: number[]; time?: string; patterns?: { routineId: string; days: number[]; time: string }[]; reminder?: 'none' | 'half' | 'all';
  on?: boolean; leadMin?: number; show?: boolean; paused?: boolean; what?: 'reminder' | 'timer'; accept?: boolean; trial?: 'all' | 'keep' | 'none';
};
export const ROUTINE_KINDS = ['routineStart', 'routineFinish', 'routineLog', 'routineEdit', 'routineSkip', 'routinePattern', 'routinePatternAll', 'routineReminder', 'routineTimer', 'routineOwnWords', 'routinePause', 'routineMerge', 'routineScaffold', 'routineTrial'];

/** The change log label of a routine command. */
export function routineLabel(c: RoutineCommand) {
  switch (c.kind) {
    case 'routineStart': return 'Sayaç başladı';
    case 'routineFinish': case 'routineLog': return 'Rutin kaydedildi';
    case 'routineEdit': return 'Seans düzeltildi';
    case 'routineSkip': return 'Bugün değil';
    case 'routinePattern': return 'Haftalık düzen değişti';
    case 'routinePatternAll': return 'Haftalık düzen onaylandı';
    case 'routineReminder': return c.on ? 'Hatırlatma açıldı' : 'Hatırlatma kapandı';
    case 'routineTimer': return c.on ? 'Sayaç açıldı' : 'Tek dokunuşa geçildi';
    case 'routineOwnWords': return c.show ? 'Kendi sözün gösteriliyor' : 'Kendi sözün gizlendi';
    case 'routinePause': return c.paused ? 'Rutin durduruldu' : 'Rutin yeniden açıldı';
    case 'routineMerge': return 'Rutinler birleştirildi';
    case 'routineScaffold': return c.accept ? (c.what === 'reminder' ? 'Hatırlatma kapandı' : 'Tek dokunuşa geçildi') : c.what === 'reminder' ? 'Hatırlatma kalsın' : 'Sayaç kalsın';
    case 'routineTrial': return 'Hatırlatma denemesi karara bağlandı';
    default: return 'Rutin';
  }
}

/** A new routine as Berthier opens it: observing from today, timed, no reminder. */
export function newRoutine(title: string, count: number, now: Date, extra: Partial<Routine> = {}): Routine {
  return { id: uid(), title: title.trim().slice(0, 90), count: Math.min(7, Math.max(1, Math.round(count))), status: 'observing', createdAt: now.toISOString(), observeFrom: dayKey(now), timer: true, reminder: { on: false, leadMin: LEAD_MIN }, ...extra };
}

/** A clock time on workday `day` (“HH:MM”), or an ISO time, as an ISO string. */
function moment(day: string, value: string) {
  if (validTime(value)) return at(day, value).toISOString();
  const t = Date.parse(value);
  if (Number.isNaN(t)) throw Error('Saat geçersiz.');
  return new Date(t).toISOString();
}
const validDays = (days: number[] | undefined) => !!days && days.length > 0 && days.length <= 7 && new Set(days).size === days.length && days.every(d => Number.isInteger(d) && d >= 0 && d <= 6);

/** Adds a session and, inside an open weekly review, notes it there. */
export function addSession(n: State, x: Omit<Session, 'id'>) {
  const session = { id: uid(), ...x };
  (n.sessions ??= []).push(session);
  if (n.review && !n.review.completedAt && x.source === 'review') n.review.decisions.push(`${n.routines?.[x.routineId]?.title}: seans eklendi.`);
  return session;
}

/** Puts a routine's session of `day` off: the skip and where the session slid this week. */
export function skipDay(n: State, r: Routine, day: string, now: Date) {
  if ((n.skips ?? []).some(k => k.routineId === r.id && k.day === day)) throw Error('Bu gün zaten ertelendi.');
  const skip: Skip = { routineId: r.id, day, at: now.toISOString() };
  (n.skips ??= []).push(skip);
  const slid = Object.entries(weekPlan(n, r, dayKey(now)).slid).find(([, from]) => from === day)?.[0];
  if (slid) skip.slidTo = slid;
  return skip;
}

export function routineAct(n: State, c: RoutineCommand, now = new Date()) {
  const today = dayKey(now), r = c.routineId ? n.routines?.[c.routineId] : undefined;
  if (!['routineFinish', 'routineEdit', 'routinePatternAll', 'routineTrial'].includes(c.kind) && !r) throw Error('Rutin bulunamadı.');
  const step = (key?: string) => { if (key === undefined) return undefined; if (!r?.steps?.some(p => p.key === key)) throw Error('Adım bulunamadı.'); return key; };
  switch (c.kind) {
    case 'routineStart': {
      if (r!.status === 'paused') throw Error('Durdurulan rutin için sayaç başlamaz.');
      if (n.running) throw Error(n.running.routineId === r!.id ? 'Sayaç zaten sürüyor.' : 'Önce süren sayacı bitir.');
      n.running = { routineId: r!.id, start: now.toISOString(), ...(c.stepKey ? { step: step(c.stepKey) } : {}) };
      return;
    }
    case 'routineFinish': {
      const run = n.running;
      if (!run) throw Error('Süren sayaç yok.');
      const day = dayKey(new Date(run.start)), end = c.end ? moment(day, c.end) : now.toISOString();
      const minutes = c.minutes ?? Math.max(1, Math.round((Date.parse(end) - Date.parse(run.start)) / MIN));
      if (Date.parse(end) < Date.parse(run.start)) throw Error('Bitiş başlangıçtan önce olamaz.');
      addSession(n, { routineId: run.routineId, day, start: run.start, end, minutes, source: 'timer', ...(run.step ? { step: run.step } : {}) });
      n.running = null;
      return;
    }
    case 'routineLog': {
      if (r!.status === 'paused') throw Error('Durdurulan rutine kayıt eklenmez.');
      const day = c.day ?? today;
      if (!validDate(day) || day > today) throw Error('Gün geçersiz.');
      const minutes = c.minutes ?? usualMinutes(n, r!) ?? 30;
      const end = c.end ? moment(day, c.end) : c.start ? new Date(Date.parse(moment(day, c.start)) + minutes * MIN).toISOString() : day === today ? now.toISOString() : new Date(at(day, r!.pattern?.time ?? r!.estimate?.time ?? '12:00').getTime() + minutes * MIN).toISOString();
      addSession(n, { routineId: r!.id, day, end, minutes, source: day === today ? 'tap' : 'review', ...(c.stepKey ? { step: step(c.stepKey) } : {}) });
      return;
    }
    case 'routineEdit': {
      const x = (n.sessions ?? []).find(x => x.id === c.sessionId);
      if (!x) throw Error('Kayıt bulunamadı.');
      if (c.minutes !== undefined) x.minutes = c.minutes;
      if (c.end) { x.end = moment(x.day, c.end); if (x.start && c.minutes === undefined) x.minutes = Math.max(1, Math.round((Date.parse(x.end) - Date.parse(x.start)) / MIN)); }
      if (x.start && Date.parse(x.end) < Date.parse(x.start)) throw Error('Bitiş başlangıçtan önce olamaz.');
      return;
    }
    case 'routineSkip': {
      if (r!.status !== 'settled') throw Error('Bugün değil, haftalık düzeni olan rutin için.');
      const day = c.day ?? today;
      if (day < weekStart(today) || day > weekOf(today)[6]) throw Error('Yalnız bu haftanın bir günü ertelenebilir.');
      if (n.running?.routineId === r!.id) throw Error('Önce süren sayacı bitir.');
      skipDay(n, r!, day, now);
      return;
    }
    case 'routinePattern': {
      if (!r!.pattern) throw Error('Haftalık düzen gözlemden sonra gelir.');
      if (!validDays(c.days) || (c.time !== undefined && !validTime(c.time))) throw Error('Gün veya saat geçersiz.');
      r!.pattern = { ...r!.pattern, days: [...c.days!].sort((a, b) => WEEK_ORDER.indexOf(a) - WEEK_ORDER.indexOf(b)), ...(c.time ? { time: c.time } : {}) };
      r!.count = c.days!.length;
      return;
    }
    case 'routinePatternAll': {
      const items = c.patterns ?? [];
      if (!items.length) throw Error('Onaylanacak düzen yok.');
      for (const p of items) {
        const x = n.routines?.[p.routineId];
        if (!x || x.status === 'paused') throw Error('Rutin bulunamadı.');
        if (!validDays(p.days) || !validTime(p.time)) throw Error('Gün veya saat geçersiz.');
        const m = mirror(n, x, today);
        x.pattern = { days: [...p.days].sort((a, b) => WEEK_ORDER.indexOf(a) - WEEK_ORDER.indexOf(b)), time: p.time, minutes: m.minutes ?? x.estimate?.minutes ?? 30, ...(m.range ? { range: m.range } : {}), ...(m.after ? { after: m.after } : {}), approvedAt: now.toISOString() };
        x.status = 'settled';
        x.count = p.days.length;
      }
      const settled = routinesOf(n).filter(x => x.status === 'settled');
      if (c.reminder === 'half') {
        const g = trialGroups(settled);
        for (const x of settled) x.reminder = { ...x.reminder, on: g.a.includes(x.id), group: g.a.includes(x.id) ? 'a' : 'b' };
        n.reminderTrial = { startedAt: now.toISOString(), ...g };
      } else for (const x of items.map(p => n.routines![p.routineId])) x.reminder = { ...x.reminder, on: c.reminder === 'all' };
      return;
    }
    case 'routineReminder': {
      if (c.on && r!.status !== 'settled') throw Error('Gözlem sürerken hatırlatma yok; düzen onaylanınca açılır.');
      r!.reminder = { ...r!.reminder, on: !!c.on, ...(c.leadMin !== undefined ? { leadMin: c.leadMin } : {}) };
      return;
    }
    case 'routineTimer': r!.timer = !!c.on; return;
    case 'routineOwnWords': if (!r!.ownWords) throw Error('Kendi sözün kayıtlı değil.'); r!.ownWords.show = !!c.show; return;
    case 'routinePause': {
      if (n.running?.routineId === r!.id) throw Error('Önce süren sayacı bitir.');
      r!.status = c.paused ? 'paused' : r!.pattern ? 'settled' : 'observing';
      return;
    }
    case 'routineMerge': {
      const target = n.routines?.[c.targetId ?? ''];
      if (!target || target.id === r!.id) throw Error('Birleştirilecek rutin bulunamadı.');
      for (const x of n.sessions ?? []) if (x.routineId === r!.id) x.routineId = target.id;
      for (const k of n.skips ?? []) if (k.routineId === r!.id) k.routineId = target.id;
      if (n.running?.routineId === r!.id) n.running.routineId = target.id;
      if (!target.ownWords && r!.ownWords) target.ownWords = r!.ownWords;
      if (n.reminderTrial) n.reminderTrial = { ...n.reminderTrial, a: n.reminderTrial.a.filter(id => id !== r!.id), b: n.reminderTrial.b.filter(id => id !== r!.id) };
      delete n.routines![r!.id];
      return;
    }
    case 'routineScaffold': {
      if (c.what !== 'reminder' && c.what !== 'timer') throw Error('Geçersiz öneri.');
      if (c.accept) { if (c.what === 'reminder') r!.reminder = { ...r!.reminder, on: false }; else r!.timer = false; }
      else r!.asked = { ...r!.asked, [c.what === 'reminder' ? 'reminderOff' : 'timerOff']: now.toISOString() };
      if (n.review && !n.review.completedAt) n.review.decisions.push(`${r!.title}: ${routineLabel(c).toLocaleLowerCase('tr-TR')}.`);
      return;
    }
    case 'routineTrial': {
      const t = n.reminderTrial;
      if (!t || t.decidedAt) throw Error('Açık hatırlatma denemesi yok.');
      if (c.trial !== 'keep') for (const x of routinesOf(n).filter(x => x.status === 'settled')) x.reminder = { ...x.reminder, on: c.trial === 'all' };
      for (const x of routinesOf(n)) if (x.reminder.group) { const rest = { ...x.reminder }; delete rest.group; x.reminder = rest; }
      n.reminderTrial = { ...t, decidedAt: now.toISOString() };
      if (n.review && !n.review.completedAt) n.review.decisions.push(`Hatırlatma denemesi: ${{ all: 'hepsine açıldı', keep: 'böyle kaldı', none: 'hepsi kapandı' }[c.trial ?? 'keep']}.`);
      return;
    }
    default: throw Error('İşlem tanınmadı.');
  }
}

/** A day spoken about a session: “bugün”, “dün”, a weekday name (the last one, today included) or a date. */
export function pastDay(text: string | null | undefined, today: string) {
  const x = (text ?? '').toLocaleLowerCase('tr-TR').trim();
  if (!x || /^bu (akşam|sabah|gece)$/.test(x) || x === 'bugün') return today;
  if (validDate(x)) return x <= today ? x : today;
  if (x.startsWith('dün')) return addDays(today, -1);
  if (x === 'evvelsi gün' || x === 'önceki gün') return addDays(today, -2);
  const name = x.replace(/^geçen /, ''), i = DAY_NAMES.map((d, i) => [d.toLocaleLowerCase('tr-TR'), i] as const).filter(([d]) => name.startsWith(d)).sort((a, b) => b[0].length - a[0].length)[0]?.[1] ?? -1;
  return i >= 0 ? addDays(today, -((weekday(today) - i + 7) % 7)) : today;
}

/** Steps as the model gives them (title, minutes, wait) with keys and offsets from the first step. */
export function stepsOf(steps: { title: string; minutes: number | null; wait: boolean }[]): RoutineStep[] {
  let offset = 0;
  return steps.map((p, i) => {
    const minutes = p.minutes ?? (p.wait ? 60 : 10), step = { key: 's' + (i + 1), title: p.title.slice(0, 60), offsetMin: offset, activeMin: p.wait ? 0 : minutes, ...(p.wait ? { wait: true } : {}) };
    offset += minutes;
    return step;
  });
}

/** Where “Bugün değil” would send today's session (A4 says it before the tap). */
export function slideTarget(s: State, r: Routine, day: string, now: Date) {
  if (r.status !== 'settled' || (s.skips ?? []).some(k => k.routineId === r.id && k.day === day)) return undefined;
  const n = structuredClone(s);
  return skipDay(n, n.routines![r.id], day, now).slidTo;
}

export const recentSessions = (s: State, r: Routine, count = 8) => sessionsOf(s, r.id).sort((a, b) => startOf(b).localeCompare(startOf(a))).slice(0, count);

export type StepView = { step: RoutineStep; index: number; state: 'done' | 'now' | 'next'; label: string; note: string; chip: string; at?: string };

/** A routine with steps (A7): each step is its own record; a waiting step writes no time and only sets when the
 *  next one is due (the waits learned from earlier rounds, else what was said). The round is the steps after
 *  the last finished one. */
export function stepsView(s: State, r: Routine): StepView[] {
  const steps = r.steps ?? [];
  if (!steps.length) return [];
  const xs = sessionsOf(s, r.id).sort((a, b) => startOf(a).localeCompare(startOf(b))), last = steps.at(-1)!.key;
  const finals = xs.filter(x => x.step === last), round = xs.filter(x => !finals.length || startOf(x) > finals.at(-1)!.end);
  const done = new Map(round.filter(x => x.step).map(x => [x.step!, x]));
  // Learned waits: from the end of the step before a wait to the start of the step after it.
  const waitOf = (i: number) => {
    const before = steps[i - 1], after = steps[i + 1], said = (after?.offsetMin ?? steps[i].offsetMin) - steps[i].offsetMin;
    if (!before || !after) return said;
    const gaps = xs.filter(x => x.step === after.key).flatMap(x => { const b = xs.filter(y => y.step === before.key && y.end <= startOf(x)).at(-1); return b ? [(Date.parse(startOf(x)) - Date.parse(b.end)) / MIN] : []; });
    return gaps.length ? median(gaps) : said;
  };
  let cursor: number | null = null, current = false;
  return steps.map((p, i) => {
    const x = done.get(p.key), next = steps[i + 1], nextDone = next && done.has(next.key);
    if (x) { cursor = Date.parse(x.end); return { step: p, index: i, state: 'done' as const, label: upper(`${WD[weekday(x.day)]} ${clock(startOf(x))}`), note: '', chip: `✓ ${minutesText(x.minutes).toLocaleUpperCase('tr-TR')}` }; }
    if (p.wait) {
      const wait = waitOf(i);
      if (nextDone) return { step: p, index: i, state: 'done' as const, label: 'BEKLENDİ', note: 'Bekleme', chip: '' };
      if (cursor !== null && !current) {
        const until = cursor + wait * MIN, since = clock(new Date(cursor).toISOString());
        current = true;
        const view = { step: p, index: i, state: 'now' as const, label: `ŞİMDİ · ${upper(sinceTime(since))} BERİ`, note: `Bekleme · ${WD[weekday(dayKey(new Date(until)))]} ≈${untilTime(clock(new Date(until).toISOString()))} kadar`, chip: `≈${Math.round(wait / 60)} SA`, at: new Date(until).toISOString() };
        cursor = until;
        return view;
      }
      cursor = cursor !== null ? cursor + wait * MIN : null;
      return { step: p, index: i, state: 'next' as const, label: 'BEKLEME', note: `Bekleme · ≈${minutesText(wait)}`, chip: '' };
    }
    const running = s.running?.routineId === r.id && s.running.step === p.key;
    const due = cursor !== null ? new Date(cursor).toISOString() : undefined;
    const state = running || (!current && (i === 0 || cursor !== null)) ? 'now' as const : 'next' as const;
    if (state === 'now') current = true;
    if (cursor !== null) cursor += p.activeMin * MIN;
    return { step: p, index: i, state, label: running ? 'SAYAÇ SÜRÜYOR' : due ? upper(`${WD[weekday(dayKey(new Date(due)))]} ${clock(due)}`) : i === 0 ? 'SIRADA' : 'SONRA', note: '', chip: `${minutesText(p.activeMin).toLocaleUpperCase('tr-TR')}`, ...(due ? { at: due } : {}) };
  });
}

/** The status card after a routine command (A5, B3): what was saved and the week's number. */
export function routineNotice(kind: string, before: State, after: State, now = new Date()): { title: string; text: string; sessionId?: string } | null {
  if (kind === 'routineFinish' || kind === 'routineLog') {
    const x = (after.sessions ?? []).find(y => !(before.sessions ?? []).some(z => z.id === y.id)), r = x && after.routines?.[x.routineId];
    return x && r ? { title: `${r.title} kaydedildi.`, text: `${minutesText(x.minutes)} · ${weekNote(after, r, x.day)}.`, sessionId: x.id } : null;
  }
  if (kind === 'routineSkip') {
    const k = (after.skips ?? []).find(y => !(before.skips ?? []).some(z => z.routineId === y.routineId && z.day === y.day)), r = k && after.routines?.[k.routineId];
    if (!k || !r) return null;
    return { title: `${r.title} ${k.day === dayKey(now) ? 'bugün değil' : `${WD[weekday(k.day)]} değil`}.`, text: k.slidTo && r.pattern ? `Seans ${DAY_NAMES[weekday(k.slidTo)]} ${untilTime(r.pattern.time)} kaydı; hafta yine ${r.count}.` : 'Bu hafta boş gün yok; sayı olduğu gibi kalır.' };
  }
  return null;
}

/** “Bu hafta 1/4”, after a session is saved. */
export function weekNote(s: State, r: Routine, day: string) {
  return `bu hafta ${weekDone(s, r, day)}/${r.count}`;
}

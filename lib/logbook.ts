// The expedition logbook (Sefer defteri): Berthier's own record of each day of the two-week expedition.
// Built only from what is already saved (orders, completed moves, closed fronts, the change log), so it
// asks nothing of the user. No streaks, scores or comparisons; a day without an order is simply “Karargâhta”.
// Day summaries come from the model when it is available (llm.ts `summarizeDays`); a plain line stands in.

import { type State, dayKey, propose } from './domain';
import { addDays, daysBetween } from './calendar';
import { dayMonth, shortDay, upper } from './turkish';

export const EXPEDITION_DAYS = 14;

/** The two-week window holding `today`. The expedition starts on the first report or approval; when one
 *  window ends the next begins, so the logbook keeps going. `index` is today's day number (1–14). */
export type Window = { first: string; start: string; days: string[]; index: number };

export function expeditionWindow(s: State, today = dayKey()): Window | null {
  const first = s.expedition?.startedAt;
  if (!first || today < first) return null;
  const start = addDays(first, Math.floor(daysBetween(first, today) / EXPEDITION_DAYS) * EXPEDITION_DAYS);
  return { first, start, days: Array.from({ length: EXPEDITION_DAYS }, (_, i) => addDays(start, i)), index: daysBetween(start, today) + 1 };
}

export type Done = { front: string; move: string; at: string };

/** Every move completed on a work day (04:00 to 04:00), in order. */
export function completedOn(s: State, day: string): Done[] {
  const out: Done[] = [];
  for (const f of Object.values(s.fronts)) for (const m of f.moves) if (m.doneAt && dayKey(new Date(m.doneAt)) === day) out.push({ front: f.title, move: m.text, at: m.doneAt });
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

/** Changes when the day's completed moves change; a stored summary is used only while it matches. */
export function sourceHash(items: Done[], first: boolean) {
  const text = JSON.stringify([first, items.map(i => [i.front, i.move])]);
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

/** Stand-in summary when the model is not available. */
export function plainSummary(items: Done[]) {
  const titles = [...new Set(items.map(i => i.front))];
  const list = titles.length > 1 ? titles.slice(0, -1).join(', ') + ' ve ' + titles.at(-1) : titles[0];
  return `Hamlesi tamamlanan cepheler: ${list}.`;
}

export type SummarySource = { day: string; first: boolean; items: Done[]; hash: string };

/** Days of the current window whose summary is missing or out of date. A stand-in written on an earlier
 *  day is retried once a day, in case the model was unavailable then. */
export function staleSummaries(s: State, today = dayKey()): SummarySource[] {
  const w = expeditionWindow(s, today);
  if (!w) return [];
  return w.days.filter(d => d <= today).flatMap(day => {
    const items = completedOn(s, day), first = day === w.start, hash = sourceHash(items, first), stored = s.logbook?.[day];
    if (!items.length) return [];
    if (stored?.hash === hash && !(stored.fallback && dayKey(new Date(stored.at)) < today)) return [];
    return [{ day, first, items, hash }];
  });
}

export type Cell = { day: string; n: string; state: 'past' | 'zero' | 'today' | 'future' };
export type Entry = { day: string; date: string; tag: string; gold: boolean; nodes: boolean[]; text: string; muted: boolean; closed: string[] };
export type Metric = { title: string; value: string; note: string };
export type Logbook = { window: Window | null; sub: string; cells: Cell[]; camps: number; closed: number; entries: Entry[]; metrics: Metric[] };

const REORDER = 'Rotanın sırası değiştirildi', SELECT = 'Günün emri değiştirildi', EDIT = 'Hamle düzenlendi', REMOVE = 'Hamle kaldırıldı';
const SETTINGS = ['Aktif projeler seçildi', 'Aktif kulvarlar seçildi', 'Mail imzası kaydedildi', 'Ritim ayarı değiştirildi'];

function duration(seconds: number) {
  const s = Math.round(seconds), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  if (h) return `${h} sa${m ? ` ${m} dk` : ''}`;
  if (m) return `${m} dk${r ? ` ${r} sn` : ''}`;
  return `${r} sn`;
}

export function logbook(s: State, today = dayKey()): Logbook {
  const w = expeditionWindow(s, today);
  if (!w) return { window: null, sub: 'İKİ HAFTALIK SEFER · İLK RAPORLA BAŞLAR', cells: [], camps: 0, closed: 0, entries: [], metrics: [] };
  const lived = w.days.filter(d => d <= today);
  const orderOf = (d: string) => s.orders[d] ?? (d === today ? propose(s, d) : undefined);
  const slotsOf = (d: string) => orderOf(d)?.slots ?? [];
  const closedOn = (d: string) => Object.values(s.fronts).filter(f => f.status === 'closed' && f.closedAt && dayKey(new Date(f.closedAt)) === d).map(f => f.title);

  const cells: Cell[] = w.days.map(d => ({
    day: d, n: String(new Date(d + 'T12:00:00Z').getUTCDate()),
    state: d > today ? 'future' : d === today ? 'today' : slotsOf(d).length ? 'past' : 'zero',
  }));

  const entries: Entry[] = [...lived].reverse().map(d => {
    const slots = slotsOf(d), items = completedOn(s, d), passed = slots.filter(x => x.doneAt).length, isToday = d === today;
    const allDone = slots.length > 0 && passed === slots.length, idle = !slots.length && !items.length;
    const tag = allDone ? 'SEFER TAMAMLANDI' : idle ? 'KARARGÂHTA' : isToday ? 'SÜRÜYOR' : d === w.start ? '1. GÜN' : '';
    const stored = s.logbook?.[d], hash = sourceHash(items, d === w.start);
    const text = idle ? (isToday ? 'Bugün için emir yok.' : 'Bu gün için emir yoktu.')
      : items.length ? (stored?.hash === hash ? stored.summary : plainSummary(items))
      : isToday ? 'Bugün henüz tamamlanan hamle yok.' : 'Bu gün tamamlanan hamle olmadı.';
    return {
      day: d, date: upper(shortDay(d)) + (isToday ? ' · BUGÜN' : ''), tag, gold: allDone,
      nodes: slots.map(x => !!x.doneAt), text, muted: !items.length, closed: closedOn(d),
    };
  });

  // Measurements of the current window; shown only when asked for.
  let total = 0, passed = 0;
  for (const d of lived) { const slots = slotsOf(d); total += slots.length; passed += slots.filter(x => x.doneAt).length; }
  const waits = lived.flatMap(d => {
    const opened = s.metrics?.reportOpenedAt?.[d], approved = s.orders[d]?.approvedAt;
    return opened && approved && approved >= opened ? [(Date.parse(approved) - Date.parse(opened)) / 1000] : [];
  });
  const inWindow = s.changes.filter(c => { const d = dayKey(new Date(c.at)); return d >= w.start && d <= today && !c.ops.every(o => o.undone); });
  const count = (labels: string[]) => inWindow.filter(c => labels.includes(c.label)).length;
  const reorders = count([REORDER]), selects = count([SELECT]), edits = count([EDIT]), removals = count([REMOVE]), settings = count(SETTINGS);
  const manual = [
    `${reorders} sıra düzenlemesi`, ...(selects ? [`${selects} emir değişikliği`] : []), ...(edits ? [`${edits} hamle düzenlemesi`] : []), ...(removals ? [`${removals} hamle kaldırma`] : []), `${settings} ayar değişikliği`,
  ];

  return {
    window: w,
    sub: `İKİ HAFTALIK SEFER · ${w.index}. GÜN / ${EXPEDITION_DAYS} · ${upper(dayMonth(w.start))} – ${upper(dayMonth(w.days.at(-1)!))}`,
    cells, entries,
    camps: lived.reduce((n, d) => n + slotsOf(d).filter(x => x.doneAt).length, 0),
    closed: lived.reduce((n, d) => n + closedOn(d).length, 0),
    metrics: [
      { title: 'Emirdeki hamlelerin tamamlanma oranı', value: total ? `%${Math.round((100 * passed) / total)} · ${passed}/${total}` : 'henüz yok', note: '“Kilitlenmeler seyreldi mi?” sorusu için destek verisi.' },
      { title: 'Rapor açılışından onaya', value: waits.length ? 'ort. ' + duration(waits.reduce((a, b) => a + b, 0) / waits.length) : 'henüz yok', note: 'Hedef birkaç dakikadan kısa. Süre raporda sayılmaz, yalnız burada görünür.' },
      { title: 'Elle düzenleme ve ayar değişikliği', value: `${reorders + selects + edits} · ${settings}`, note: manual.join(', ') + '. Hedef sıfıra yakın.' },
    ],
  };
}

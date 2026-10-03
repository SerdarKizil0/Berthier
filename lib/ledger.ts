// Kayıt defteri wording: what a change did, in the user's words. Used by the status card after a dictation
// or an action (“3 değişiklik. 1 yeni cephe, 1 hamle, 1 tarih.”) and by the change log rows.
// Read-only: nothing here changes the state.

import { type Change, type Dictation, type Front, type Op, type Order, type State, undo } from './domain';
import { addDays, calendarDay, type CalendarEvent } from './calendar';
import { clockText } from './expedition/camps';
import { type Idea } from './research';
import { atTime, shortDay, upper } from './turkish';

export type OpLine = { tag: string; text: string; count: string };

const STATUS: Record<Front['status'], string> = { active: 'aktif', held: 'bekletiliyor', closed: 'kapandı' };

function frontLine(before: Front | null, after: Front | null): OpLine {
  const f = after ?? before!;
  if (!before) return { tag: 'YENİ CEPHE', text: f.title, count: 'yeni cephe' };
  if (!after) return { tag: 'CEPHE', text: `${f.title} kaldırıldı`, count: 'cephe' };
  const old = new Map(before.moves.map(m => [m.id, m]));
  const added = after.moves.filter(m => !old.has(m.id) && !m.doneAt);
  const done = after.moves.filter(m => m.doneAt && !old.get(m.id)?.doneAt);
  const edited = after.moves.filter(m => old.has(m.id) && old.get(m.id)!.text !== m.text);
  if (before.status !== after.status) return { tag: 'DURUM', text: `${f.title}: ${STATUS[after.status]}`, count: 'durum' };
  if (done.length) return { tag: 'HAMLE BİTTİ', text: `${f.title}: ${done[0].text}`, count: 'hamle' };
  if (added.length) return { tag: 'YENİ HAMLE', text: `${f.title}: ${added[0].text}${added.length > 1 ? ` (+${added.length - 1})` : ''}`, count: 'hamle' };
  if (edited.length) return { tag: 'HAMLE', text: `${f.title}: ${edited[0].text}`, count: 'hamle' };
  if (before.where !== after.where && after.where) return { tag: 'KALDIĞIN YER', text: `${f.title}: ${after.where}`, count: 'not' };
  if (before.title !== after.title) return { tag: 'CEPHE', text: after.title, count: 'cephe' };
  return { tag: 'CEPHE', text: f.title, count: 'not' };
}

function orderLine(before: Order | null, after: Order | null, fronts: State['fronts']): OpLine {
  const title = (id: string) => fronts[id]?.title ?? 'Cephe';
  if (after?.approvedAt && !before?.approvedAt) return { tag: 'EMİR', text: 'Günün emri onaylandı.', count: 'emir' };
  if (before?.approvedAt && !after?.approvedAt) return { tag: 'EMİR', text: 'Onay geri alındı.', count: 'emir' };
  const was = new Set(before?.slots.map(x => x.frontId)), is = new Set(after?.slots.map(x => x.frontId));
  const passed = after?.slots.find(x => x.doneAt && !before?.slots.find(y => y.frontId === x.frontId)?.doneAt);
  if (passed) return { tag: 'KAMP', text: `${title(passed.frontId)} geçildi.`, count: 'kamp' };
  const added = [...is].filter(id => !was.has(id)), removed = [...was].filter(id => !is.has(id));
  if (added.length || removed.length) {
    const parts = [...added.map(id => `${title(id)} eklendi`), ...removed.map(id => `${title(id)} çıkarıldı`)];
    return { tag: 'GÜNÜN EMRİ', text: parts.join(', ') + '.', count: 'emir' };
  }
  return { tag: 'SIRA', text: 'Rotanın sırası değişti.', count: 'sıra' };
}

type CalendarValue = { events: Record<string, CalendarEvent>; profile: unknown; prepDefaults: unknown; seenConflicts: string[] };

function calendarLine(before: CalendarValue | null, after: CalendarValue | null): OpLine {
  const b = before?.events ?? {}, a = after?.events ?? {};
  const changed = Object.values(a).filter(e => JSON.stringify(b[e.id]) !== JSON.stringify(e));
  const e = changed.find(x => !x.cancelled) ?? changed[0];
  if (e) return { tag: 'TARİH', text: `${e.title}${e.cancelled ? ' kaldırıldı' : e.date ? ', ' + shortDay(e.date) + (e.time ? ' ' + e.time : '') : ''}${changed.length > 1 ? ` (+${changed.length - 1})` : ''}`, count: 'tarih' };
  if (JSON.stringify(before?.profile) !== JSON.stringify(after?.profile)) return { tag: 'MAİL İMZASI', text: 'Çakışma maili imzası', count: 'ayar' };
  if (JSON.stringify(before?.seenConflicts) !== JSON.stringify(after?.seenConflicts)) return { tag: 'ÇAKIŞMA', text: (after?.seenConflicts.length ?? 0) > (before?.seenConflicts.length ?? 0) ? 'Görüldü olarak işaretlendi.' : 'Yeniden açıldı.', count: 'çakışma' };
  return { tag: 'HAZIRLIK', text: 'Hazırlık süreleri', count: 'ayar' };
}

type ResearchValue = { ideas: Record<string, Idea>; review: { step: number; completedAt?: string } | null };

function researchLine(before: ResearchValue | null, after: ResearchValue | null): OpLine {
  const b = before?.ideas ?? {}, a = after?.ideas ?? {};
  const added = Object.values(a).filter(i => !b[i.id]), changed = Object.values(a).filter(i => b[i.id] && b[i.id].status !== i.status);
  if (added.length) return { tag: 'DEPO', text: added.length === 1 ? added[0].text : `${added.length} kalem depoya eklendi`, count: 'depo kalemi' };
  if (changed.length) return { tag: 'DEPO', text: `${changed[0].text} · ${changed[0].status === 'dismissed' ? 'atıldı' : changed[0].status === 'converted' ? 'hamleye çevrildi' : 'depoda'}`, count: 'depo kalemi' };
  const moved = Object.values(a).find(i => b[i.id] && b[i.id].laneId !== i.laneId);
  if (moved) return { tag: 'DEPO', text: `${moved.text} · kulvara atandı`, count: 'depo kalemi' };
  return { tag: 'TEFTİŞ', text: after?.review?.completedAt && !before?.review?.completedAt ? 'Teftiş tamamlandı.' : 'Teftiş adımı', count: 'teftiş' };
}

/** One line per operation: a short tag (“YENİ HAMLE”) and what it is (“Kargo iadesi: İade paketini …”). */
export function describeOp(op: Op, fronts: State['fronts']): OpLine {
  if (op.key.startsWith('front:')) return frontLine(op.before as Front | null, op.after as Front | null);
  if (op.key.startsWith('order:')) return orderLine(op.before as Order | null, op.after as Order | null, fronts);
  if (op.key === 'calendar') return calendarLine(op.before as CalendarValue | null, op.after as CalendarValue | null);
  if (op.key === 'research') return researchLine(op.before as ResearchValue | null, op.after as ResearchValue | null);
  if (op.key === 'preferences') return { tag: 'TERCİH', text: 'Ön adım tercihi', count: 'tercih' };
  if (op.key === 'setup') return { tag: 'KULVARLAR', text: 'Aktif kulvar seçimi', count: 'ayar' };
  if (op.key === 'rhythm') return { tag: 'RİTİM', text: 'Ritim ayarı', count: 'ayar' };
  return { tag: 'KAYIT', text: op.key, count: 'kayıt' };
}

const ORDER = ['yeni cephe', 'hamle', 'kamp', 'tarih', 'emir', 'sıra', 'durum', 'not', 'depo kalemi', 'çakışma', 'teftiş', 'tercih', 'ayar'];

/** “1 yeni cephe, 1 hamle, 1 tarih.” for the operations a change made (undone ones are left out). */
export function breakdown(change: Change, fronts: State['fronts']) {
  const counts = new Map<string, number>();
  for (const op of change.ops) if (!op.undone) { const c = describeOp(op, fronts).count; counts.set(c, (counts.get(c) ?? 0) + 1); }
  const rank = (name: string) => (ORDER.indexOf(name) + ORDER.length + 1) % (ORDER.length + 1);
  return [...counts].sort((a, b) => rank(a[0]) - rank(b[0])).map(([name, n]) => `${n} ${name}`).join(', ') + (counts.size ? '.' : '');
}

/** The status card after a change: a dictation tells how many changes it made, an action names itself. */
export function changeNotice(change: Change, fronts: State['fronts']) {
  const live = change.ops.filter(o => !o.undone).length;
  if (change.sourceId) return { title: `${live} değişiklik.`, text: breakdown(change, fronts) };
  return { title: change.label.replace(/[.]?$/, '.'), text: live > 1 ? breakdown(change, fronts) : '' };
}

// ── Kayıt defteri (design 1l): one stream by day; a dictation and the changes it made sit together. ──

export type LedgerItem =
  | { kind: 'dictation'; at: string; dictation: Dictation; change?: Change }
  | { kind: 'change'; at: string; change: Change };
export type LedgerDay = { day: string; label: string; items: LedgerItem[] };

/** Entries newest first, grouped by calendar day (“BUGÜN · CMT 26 EYL”, “DÜN · CUM 25 EYL”). A change
 *  made by a dictation (Change.sourceId) is shown under that dictation, not on its own. */
export function ledgerDays(s: State, dictations: Dictation[], now = new Date()): LedgerDay[] {
  const today = calendarDay(now), byId = new Map(dictations.map(d => [d.id, d]));
  const items: LedgerItem[] = [];
  for (const d of dictations) if (d.created_at && !['failed', 'queued'].includes(d.status)) items.push({ kind: 'dictation', at: d.created_at, dictation: d, change: s.changes.find(c => c.sourceId === d.id) });
  for (const c of s.changes) if (!c.sourceId || !byId.has(c.sourceId)) items.push({ kind: 'change', at: c.at, change: c });
  items.sort((a, b) => b.at.localeCompare(a.at));
  const days: LedgerDay[] = [];
  for (const item of items) {
    const day = calendarDay(new Date(item.at));
    if (days.at(-1)?.day !== day) {
      const name = upper(shortDay(day));
      days.push({ day, label: day === today ? `BUGÜN · ${name}` : day === addDays(today, -1) ? `DÜN · ${name}` : name, items: [] });
    }
    days.at(-1)!.items.push(item);
  }
  return days;
}

/** Why an undo would be refused, from the same rules as `undo` (nothing is applied). A newer change on
 *  the same record names its time: “Önce 10:12’deki değişikliği geri al.” */
export function undoBlock(s: State, change: Change, index?: number): string | null {
  if (change.ops.every(o => o.undone) || (index !== undefined && change.ops[index]?.undone)) return null;
  try { undo(s, change.id, index); return null; } catch (e) {
    const message = e instanceof Error ? e.message : 'Geri alınamıyor.';
    if (!message.startsWith('Bu kayıtta daha yeni bir değişiklik var')) return message;
    const keys = new Set((index === undefined ? change.ops : [change.ops[index]]).filter(o => !o.undone).map(o => o.key));
    const later = s.changes.filter(c => c.at >= change.at && c.id !== change.id && c.ops.some(o => !o.undone && keys.has(o.key))).at(-1);
    if (!later) return message;
    const day = calendarDay(new Date(later.at)), when = day === calendarDay(new Date(change.at)) ? atTime(clockText(later.at)) : `${shortDay(day)} ${atTime(clockText(later.at))}`;
    return `Önce ${when}ki değişikliği geri al.`;
  }
}

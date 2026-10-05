// Kayıt defteri wording: what a change did, in the user's words. Used by the status card after a dictation
// or an action (“3 değişiklik. 1 yeni cephe, 1 hamle, 1 tarih.”) and by the change log rows.
// Read-only: nothing here changes the state.

import { type Change, type Dictation, type Front, type Op, type Order, type State, openMoves, typeNames, undo } from './domain';
import { addDays, calendarDay, type CalendarEvent } from './calendar';
import { clockText } from './expedition/camps';
import { type Idea } from './research';
import { type ReminderTrial, type Routine, type Running, type Session, type Skip, countText, daysText, routineLabel, weekday } from './routines';
import { KIND_TAG, type Kind } from './kinds';
import { DAY_NAMES, atTime, shortDay, untilTime, upper } from './turkish';

/** `quiet`: a line that only follows another one in the same change (the timer stopping when a session is
 *  saved, sessions moving with a merge); it is left out of counts and, when others exist, of the row. */
export type OpLine = { tag: string; text: string; count: string; quiet?: boolean };

const STATUS: Record<Front['status'], string> = { active: 'aktif', held: 'bekletiliyor', closed: 'kapandı' };

function frontLine(before: Front | null, after: Front | null): OpLine {
  const f = after ?? before!;
  if (!before) return { tag: 'YENİ CEPHE', text: f.title, count: 'yeni cephe' };
  if (!after) return { tag: 'CEPHE', text: `${f.title} kaldırıldı`, count: 'cephe' };
  const old = new Map(before.moves.map(m => [m.id, m]));
  const added = after.moves.filter(m => !old.has(m.id) && !m.doneAt);
  const done = after.moves.filter(m => m.doneAt && !old.get(m.id)?.doneAt);
  const edited = after.moves.filter(m => old.has(m.id) && old.get(m.id)!.text !== m.text);
  const removed = after.moves.filter(m => m.removedAt && !old.get(m.id)?.removedAt);
  if (before.type !== after.type) return { tag: 'TÜR', text: `${f.title}: ${typeNames[before.type]} → ${typeNames[after.type]}`, count: 'tür' };
  if (before.status !== after.status) return { tag: 'DURUM', text: `${f.title}: ${STATUS[after.status]}`, count: 'durum' };
  if (done.length) return { tag: 'HAMLE BİTTİ', text: `${f.title}: ${done[0].text}`, count: 'hamle' };
  if (removed.length) return { tag: 'KALDIRILDI', text: `${f.title}: ${removed[0].text}`, count: 'hamle' };
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
  // The same camps in the same order: a camp's move changed (edited, or taken out and the next one moved up).
  const moved = after?.slots.find((x, i) => !x.doneAt && before?.slots[i]?.frontId === x.frontId && (before.slots[i].moveId !== x.moveId || before.slots[i].text !== x.text));
  if (moved && before?.slots.every((x, i) => after?.slots[i]?.frontId === x.frontId)) return { tag: 'GÜNÜN EMRİ', text: `${title(moved.frontId)}: ${moved.text}`, count: 'emir', quiet: true };
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
  if (moved) return { tag: 'DEPO', text: `${moved.text} · ${moved.laneId ? 'projeye atandı' : 'sahipsiz'}`, count: 'depo kalemi' };
  return { tag: 'TEFTİŞ', text: after?.review?.completedAt && !before?.review?.completedAt ? 'Teftiş tamamlandı.' : 'Teftiş adımı', count: 'teftiş' };
}

/** A routine's name for a record: from the state, else from the change that holds the routine's own line. */
function routineName(id: string, routines: State['routines'], change?: Change) {
  const op = change?.ops.find(o => o.key === 'routine:' + id);
  return routines?.[id]?.title ?? (op?.after as Routine | null)?.title ?? (op?.before as Routine | null)?.title ?? 'Rutin';
}

/** RUTİN (new, put away, merged, settings) and DÜZEN, for one routine's own key. */
function routineLine(before: Routine | null, after: Routine | null, change?: Change): OpLine {
  const r = after ?? before!;
  if (!before) return { tag: 'RUTİN', text: `${r.title} · ${countText(r.count)}`, count: 'rutin' };
  if (!after) {
    const merged = change?.label === routineLabel({ kind: 'routineMerge' }) || !!change?.ops.some(o => o.key.startsWith('session:') && (o.before as Session | null)?.routineId === r.id && !!o.after && (o.after as Session).routineId !== r.id);
    return { tag: 'RUTİN', text: `${r.title} ${merged ? 'birleştirildi' : 'kaldırıldı'}`, count: 'rutin' };
  }
  if (JSON.stringify(before.pattern) !== JSON.stringify(after.pattern) && after.pattern) return { tag: 'DÜZEN', text: `${r.title}: ${daysText(after.pattern.days)} · ${after.pattern.time}`, count: 'düzen' };
  if (before.status !== after.status) return { tag: 'RUTİN', text: `${r.title}: ${after.status === 'paused' ? 'durduruldu' : 'yeniden açıldı'}`, count: 'rutin' };
  if (before.reminder.on !== after.reminder.on) return { tag: 'RUTİN', text: `${r.title}: hatırlatma ${after.reminder.on ? 'açık' : 'kapalı'}`, count: 'ayar' };
  if (before.timer !== after.timer) return { tag: 'RUTİN', text: `${r.title}: ${after.timer ? 'sayaçla' : 'tek dokunuş'}`, count: 'ayar' };
  if (JSON.stringify(before.ownWords) !== JSON.stringify(after.ownWords)) return { tag: 'RUTİN', text: `${r.title}: kendi sözün ${after.ownWords?.show ? 'görünür' : 'gizli'}`, count: 'ayar' };
  if (JSON.stringify(before.asked) !== JSON.stringify(after.asked)) return { tag: 'RUTİN', text: `${r.title}: öneri sonra sorulur`, count: 'ayar' };
  if (before.count !== after.count) return { tag: 'RUTİN', text: `${r.title} · ${countText(after.count)}`, count: 'rutin' };
  return { tag: 'RUTİN', text: r.title, count: 'rutin', quiet: true };
}

/** SEANS: a session written, corrected, or taken out with its routine. */
function sessionLine(before: Session | null, after: Session | null, routines: State['routines'], change?: Change): OpLine {
  const x = after ?? before!, name = routineName(x.routineId, routines, change);
  if (!before) return { tag: 'SEANS', text: `${name} · ${x.minutes} dk`, count: 'seans' };
  if (!after) return { tag: 'SEANS', text: `${name} · ${x.minutes} dk kaldırıldı`, count: 'seans', quiet: true };
  if (before.routineId !== after.routineId) return { tag: 'SEANS', text: `${routineName(before.routineId, routines, change)} → ${name}`, count: 'seans', quiet: true };
  return { tag: 'SEANS', text: `${name} · ${after.minutes} dk`, count: 'seans' };
}

/** BUGÜN DEĞİL: a day put off and where its session slid (BU HAFTA DEĞİL: the rest of the week). */
function skipLine(before: Skip | null, after: Skip | null, routines: State['routines'], change?: Change): OpLine {
  const k = after ?? before!, name = routineName(k.routineId, routines, change), r = routines?.[k.routineId];
  const tag = k.week ? 'BU HAFTA DEĞİL' : 'BUGÜN DEĞİL';
  if (!before) return { tag, text: `${name}${k.slidTo && r?.pattern ? ` · ${DAY_NAMES[weekday(k.slidTo)]} ${untilTime(r.pattern.time)} kaydı` : ''}`, count: 'rutin' };
  return { tag, text: after ? name : `${name} · kaldırıldı`, count: 'rutin', quiet: true };
}

/** SAYAÇ: the timer starting; its stopping goes with the session it saved. */
function runningLine(before: Running | null, after: Running | null, routines: State['routines'], change?: Change): OpLine {
  const name = routineName((after ?? before!).routineId, routines, change);
  return !before && after ? { tag: 'SAYAÇ', text: `${name} başladı`, count: 'sayaç' } : { tag: 'SAYAÇ', text: after ? name : `${name} durdu`, count: 'sayaç', quiet: true };
}

type LearnedValue = { kindPreferences: { text: string; from: Kind; to: Kind }[]; typePreferences: { title: string; from: Front['type']; to: Front['type'] | 'routine' }[] };

function learnedLine(before: LearnedValue | null, after: LearnedValue | null): OpLine {
  const k = (after?.kindPreferences ?? []).slice((before?.kindPreferences ?? []).length)[0];
  if (k) return { tag: 'TÜR', text: `${k.text}: ${KIND_TAG[k.from].toLocaleLowerCase('tr-TR')} → ${KIND_TAG[k.to].toLocaleLowerCase('tr-TR')}`, count: 'tür' };
  const t = (after?.typePreferences ?? []).slice((before?.typePreferences ?? []).length)[0];
  if (t) return { tag: 'TÜR', text: `${t.title}: ${typeNames[t.from]} → ${t.to === 'routine' ? 'Rutin' : typeNames[t.to]}`, count: 'tür' };
  return { tag: 'TERCİH', text: 'Tür tercihi', count: 'tercih' };
}

/** One line per operation: a short tag (“YENİ HAMLE”) and what it is (“Kargo iadesi: İade paketini …”).
 *  Routine records name their routine from `routines` (or from the change holding the routine's line). A merge
 *  names the routine it took away; what moved with it (sessions, days, the timer, own words) follows quietly. */
export function describeOp(op: Op, fronts: State['fronts'], routines: State['routines'] = {}, change?: Change): OpLine {
  const line = opLine(op, fronts, routines, change);
  return change?.label === routineLabel({ kind: 'routineMerge' }) && !(op.key.startsWith('routine:') && !op.after) ? { ...line, quiet: true } : line;
}

function opLine(op: Op, fronts: State['fronts'], routines: State['routines'], change?: Change): OpLine {
  if (op.key.startsWith('front:')) return frontLine(op.before as Front | null, op.after as Front | null);
  if (op.key.startsWith('order:')) return orderLine(op.before as Order | null, op.after as Order | null, fronts);
  if (op.key === 'calendar') return calendarLine(op.before as CalendarValue | null, op.after as CalendarValue | null);
  if (op.key === 'research') return researchLine(op.before as ResearchValue | null, op.after as ResearchValue | null);
  if (op.key === 'preferences') return { tag: 'TERCİH', text: 'Ön adım tercihi', count: 'tercih' };
  if (op.key.startsWith('routine:')) return routineLine(op.before as Routine | null, op.after as Routine | null, change);
  if (op.key.startsWith('session:')) return sessionLine(op.before as Session | null, op.after as Session | null, routines, change);
  if (op.key.startsWith('skip:')) return skipLine(op.before as Skip | null, op.after as Skip | null, routines, change);
  if (op.key === 'running') return runningLine(op.before as Running | null, op.after as Running | null, routines, change);
  if (op.key === 'reminderTrial') return { tag: 'DÜZEN', text: (op.after as ReminderTrial | null)?.decidedAt ? 'Hatırlatma denemesi bitti' : op.after ? 'Hatırlatma denemesi' : 'Hatırlatma denemesi kaldırıldı', count: 'düzen' };
  if (op.key === 'learned') return learnedLine(op.before as LearnedValue | null, op.after as LearnedValue | null);
  if (op.key === 'setup') return { tag: 'PROJELER', text: 'Aktif proje seçimi', count: 'ayar' };
  if (op.key === 'rhythm') return { tag: 'RİTİM', text: 'Ritim ayarı', count: 'ayar' };
  return { tag: 'KAYIT', text: op.key, count: 'kayıt' };
}

const ORDER = ['yeni cephe', 'hamle', 'rutin', 'seans', 'kamp', 'tarih', 'emir', 'sıra', 'durum', 'tür', 'düzen', 'sayaç', 'not', 'depo kalemi', 'çakışma', 'teftiş', 'tercih', 'ayar'];

/** A change's lines that are not undone: the quiet ones only when nothing else is left. */
function liveLines(change: Change, fronts: State['fronts'], routines: State['routines'] = {}) {
  const all = change.ops.filter(o => !o.undone).map(o => describeOp(o, fronts, routines, change));
  return all.some(l => !l.quiet) ? all.filter(l => !l.quiet) : all;
}

/** “1 yeni cephe, 1 hamle, 1 tarih.” for the operations a change made (undone ones are left out). */
export function breakdown(change: Change, fronts: State['fronts'], routines: State['routines'] = {}) {
  const counts = new Map<string, number>();
  for (const line of liveLines(change, fronts, routines)) counts.set(line.count, (counts.get(line.count) ?? 0) + 1);
  const rank = (name: string) => (ORDER.indexOf(name) + ORDER.length + 1) % (ORDER.length + 1);
  return [...counts].sort((a, b) => rank(a[0]) - rank(b[0])).map(([name, n]) => `${n} ${name}`).join(', ') + (counts.size ? '.' : '');
}

/** The status card after a change: a dictation tells how many changes it made, an action names itself. */
export function changeNotice(change: Change, fronts: State['fronts'], routines: State['routines'] = {}) {
  const live = liveLines(change, fronts, routines).length;
  if (change.sourceId) return { title: `${live} değişiklik.`, text: breakdown(change, fronts, routines) };
  return { title: change.label.replace(/[.]?$/, '.'), text: live > 1 ? breakdown(change, fronts, routines) : '' };
}

/** The status card after “Olduğu gibi ekle”, “Kaldır” and Harita › Seç (the reducer's labels): where the move
 *  went in its front's queue, which move left, which fronts closed. Null for any other change. */
export function handNotice(change: Change): { title: string; text: string } | null {
  const fronts = change.ops.filter(o => o.key.startsWith('front:')).map(o => ({ before: o.before as Front | null, after: o.after as Front | null }));
  const today = change.ops.some(o => o.key.startsWith('order:') && !!(o.after as Order | null)?.slots.some(x => fronts.some(f => f.after?.id === x.frontId) && !(o.before as Order | null)?.slots.some(y => y.frontId === x.frontId)));
  if (change.label === 'Hamle eklendi' && fronts[0]?.after) {
    const { before, after } = fronts[0], m = after.moves.find(x => !before?.moves.some(y => y.id === x.id));
    const i = m ? openMoves(after).indexOf(m) : -1;
    return { title: 'Eklendi.', text: [after.title, !before ? 'yeni cephe' : i === 0 ? 'sıradaki hamle' : i > 0 ? `${i + 1}. sırada` : '', today ? 'bugünün emrinde' : ''].filter(Boolean).join(' · ') };
  }
  if (change.label === 'Hamle kaldırıldı' && fronts[0]?.after) {
    const { before, after } = fronts[0], m = after.moves.find(x => x.removedAt && !before?.moves.find(y => y.id === x.id)?.removedAt);
    return { title: 'Kaldırıldı.', text: m?.text ?? '' };
  }
  if (/ cephe kapatıldı$/.test(change.label)) return { title: change.label + '.', text: fronts.filter(f => f.after?.status === 'closed').map(f => f.after!.title).join(', ') };
  return null;
}

/** A change row's lines: the quiet ones only when nothing else is left. */
export function changeLines(change: Change, fronts: State['fronts'], routines: State['routines'] = {}) {
  return liveLines(change, fronts, routines).map(l => l.text);
}

/** Routines the change log can name: the live ones, and those merged or moved away (from their own lines). */
export function ledgerRoutines(s: State): State['routines'] {
  const gone: Record<string, Routine> = {};
  for (const c of s.changes) for (const o of c.ops) if (o.key.startsWith('routine:')) { const r = (o.after ?? o.before) as Routine | null; if (r) gone[r.id] = r; }
  return { ...gone, ...s.routines };
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

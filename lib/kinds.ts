// Dikte türleri (design 4 Ekim, C1–C3, K7, K8). Everything said goes to one place — a move, a routine, a dated
// item, an idea or a record — and Berthier says where, item by item, with its second guess ready as one tap.
// The kind is never asked: the receipt (status card, Kayıt defteri) and the front page are where it changes.
// A move to another kind is one change of its own (undoable); the raw dictation stays as it was.

import { type Front, type FrontType, type Moved, type State, canonicalTitle, dayKey, normalize, propose, replaceSlot, similarity, typeNames, uid } from './domain';
import { calendarDay, syncPlans, type CalendarEvent } from './calendar';
import { type Idea } from './research';
import type { Parsed } from './llm';
import { type Routine, type Session, countText, dayMin, durationText, findRoutine, newRoutine, routinesOf, weekDone, weekNote, weekPlan, weekday } from './routines';
import { DAY_NAMES, shortDay, untilTime, withName } from './turkish';

export type Kind = 'move' | 'routine' | 'event' | 'idea' | 'record';
export const KIND_TAG: Record<Kind, string> = { move: 'HAMLE', routine: 'RUTİN', event: 'TARİH', idea: 'FİKİR', record: 'KAYIT' };
/** The kinds a placed item can be moved to (Kayıt defteri › Değiştir). */
export const TARGETS: [Exclude<Kind, 'record'>, string][] = [['move', 'Hamle'], ['routine', 'Rutin'], ['event', 'Tarih'], ['idea', 'Fikir']];
export type Alt = { to: Kind | 'merge'; label: string; targetId?: string };
/** One item a dictation placed. `key` is the change-log key holding it; null when nothing changed (a pointer). */
export type Placement = { ref: string; kind: Kind; key: string | null; text: string; note: string; alt?: Alt };

type RoutinesValue = { routines?: Record<string, Routine>; sessions?: Session[] };

function eventNote(s: State, e: CalendarEvent) {
  const when = e.weekly && e.date ? `Her ${DAY_NAMES[weekday(e.date)]}${e.time ? ' ' + e.time : ''}` : e.date ? shortDay(e.date) + (e.time ? ' ' + e.time : '') : 'Tarihi belli değil';
  const front = e.frontId ? s.fronts[e.frontId]?.title : undefined;
  return front ? `${front} · ${when}` : when;
}

/** What a dictation placed, from the state before and after it and the model's output (for second guesses and
 *  for pointers, which change nothing). */
export function placementsOf(before: State, after: State, p: Parsed, now = new Date()): Placement[] {
  const out: Placement[] = [], today = dayKey(now), order = after.orders[today] ?? propose(after, today);
  for (const f of Object.values(after.fronts)) {
    const b = before.fronts[f.id], item = p.items.find(i => i.id === f.id || canonicalTitle(i.title) === canonicalTitle(f.title));
    for (const m of f.moves) {
      const was = b?.moves.find(x => x.id === m.id);
      if (!was && !m.doneAt && !m.eventId) {
        const same = similarity(f.title, m.text) >= 0.5 || normalize(m.text).includes(normalize(f.title));
        const note = same ? `${typeNames[f.type]} · ${order.slots.some(x => x.moveId === m.id) ? 'bugünün rotasına önerildi' : b ? f.title : 'yeni cephe'}` : f.title;
        out.push({ ref: `move:${f.id}:${m.id}`, kind: 'move', key: 'front:' + f.id, text: m.text, note, ...(item?.alt === 'routine' ? { alt: { to: 'routine' as const, label: 'Rutin olsun' } } : {}) });
      } else if (m.doneAt && was && !was.doneAt) out.push({ ref: `done:${f.id}:${m.id}`, kind: 'record', key: 'front:' + f.id, text: m.text, note: `${f.title} · hamle bitti` });
    }
    if (b && f.where && b.where !== f.where) out.push({ ref: `where:${f.id}`, kind: 'record', key: 'front:' + f.id, text: f.where, note: `${f.title} · kaldığın yer` });
  }
  const events = before.events ?? {};
  for (const e of Object.values(after.events ?? {})) if (!e.cancelled && JSON.stringify(events[e.id]) !== JSON.stringify(e)) out.push({ ref: `event:${e.id}`, kind: 'event', key: 'calendar', text: e.title, note: (events[e.id] ? 'Güncellendi · ' : '') + eventNote(after, e) });
  for (const i of Object.values(after.ideas ?? {})) if (!before.ideas?.[i.id]) out.push({ ref: `idea:${i.id}`, kind: 'idea', key: 'research', text: i.text, note: i.laneId && after.fronts[i.laneId] ? after.fronts[i.laneId].title : 'Sahipsiz' });
  for (const r of routinesOf(after)) {
    const was = before.routines?.[r.id];
    if (!was) {
      const twin = routinesOf(before).find(x => similarity(x.title, r.title) >= 0.3), said = p.routines?.find(x => normalize(x.title) === normalize(r.title));
      const alt: Alt | undefined = twin ? { to: 'merge', label: `${withName(twin.title)} aynı`, targetId: twin.id } : said?.alt === 'move' ? { to: 'move', label: 'Tek seferlik hamle yap' } : undefined;
      out.push({ ref: `routine:${r.id}`, kind: 'routine', key: 'routines', text: `${r.title} · ${countText(r.count)}`, note: 'Gözlem başladı', ...(alt ? { alt } : {}) });
    } else if (was.count !== r.count) out.push({ ref: `count:${r.id}`, kind: 'record', key: 'routines', text: `${r.title} · ${countText(r.count)}`, note: 'Sıklık değişti' });
  }
  const sessions = new Set((before.sessions ?? []).map(x => x.id)), skips = new Set((before.skips ?? []).map(k => k.routineId + k.day));
  for (const x of after.sessions ?? []) {
    const r = after.routines?.[x.routineId];
    if (!sessions.has(x.id) && r) out.push({ ref: `session:${x.id}`, kind: 'record', key: 'routines', text: `${r.title} · ${x.minutes} dk`, note: `Seans yazıldı · ${weekNote(after, r, today)}` });
  }
  for (const k of after.skips ?? []) {
    const r = after.routines?.[k.routineId];
    if (skips.has(k.routineId + k.day) || !r) continue;
    out.push({ ref: `skip:${k.routineId}:${k.day}`, kind: 'record', key: 'routines', text: `${r.title} · ${k.day === today ? 'bugün değil' : shortDay(k.day) + ' olmadı'}`, note: k.slidTo && r.pattern ? `Seans ${DAY_NAMES[weekday(k.slidTo)]} ${untilTime(r.pattern.time)} kaydı` : 'Kayıt düştü' });
  }
  // Rule 3: an existing routine only pointed at (“yüz yogası yap”) changes nothing; the receipt says where it is.
  for (const x of p.sessions ?? []) {
    const r = x.routineId ? after.routines?.[x.routineId] : undefined;
    if (x.done || x.skip || !r || out.some(o => o.ref === `routine:${r.id}`)) continue;
    const n = weekDone(after, r, today), planned = r.status === 'settled' && r.pattern && weekPlan(after, r, today).upcoming.includes(today);
    const when = planned ? `${dayMin(r.pattern!.time) >= 13 * 60 ? 'bu akşam' : 'bugün'} ${r.pattern!.time}` : r.status === 'settled' ? `bu hafta ${n}/${r.count}` : 'gözlemde';
    const note = r.status === 'settled' ? [n ? `Bu hafta ${n}/${r.count}` : 'Haftanın ilk seansı', durationText(after, r)].filter(Boolean).join(' · ') : 'Başlat ya da Yaptım ile kaydedilir';
    out.push({ ref: `routine:${r.id}`, kind: 'routine', key: null, text: `${r.title} · ${when}`, note, alt: { to: 'move', label: 'Tek seferlik hamle yap' } });
  }
  return out;
}

/** The receipt as it stands now: an item moved later (`Change.moved`, not undone) shows where it went. */
export function effective(s: State, sourceId: string, placed: Placement[]): (Placement & { changeId?: string })[] {
  return placed.map(first => {
    let p: Placement & { changeId?: string } = { ...first };
    for (const c of s.changes) {
      const m = c.moved;
      if (!m || m.sourceId !== sourceId || m.ref !== p.ref || c.ops.every(o => o.undone)) continue;
      p = { ref: m.newRef, kind: m.to, key: m.key, text: m.text, note: m.note, changeId: c.id };
    }
    return p;
  });
}

/** The receipt's head: “Yerleştirdim. 3 kalem.”, or for a pointer only “Zaten düzende. Yeni hamle açmadım.” */
export function receiptTitle(placed: Placement[]) {
  if (placed.length && placed.every(p => p.key === null)) return { title: 'Zaten düzende.', text: 'Yeni hamle açmadım.' };
  return { title: 'Yerleştirdim.', text: `${placed.length} kalem.` };
}

/** “Yüz yogası yap.” → “Yüz yogası”. */
const routineTitle = (text: string) => text.replace(/[.!?]+$/, '').replace(/\s+(yap|et|yapmak|etmek)$/iu, '').trim().slice(0, 90);

function dropSlots(n: State, frontId: string, now: Date) {
  const o = n.orders[dayKey(now)];
  if (o) o.slots = o.slots.filter(x => x.frontId !== frontId || !!x.doneAt);
}

/** Moves one placed item to another kind (one change). An item this dictation created is taken out of its old
 *  place; one that existed before (a pointer) stays, and the new item is added next to it. The correction is
 *  remembered for similar items (kindPreferences). */
export function rekind(n: State, c: { sourceId?: string; ref?: string; to?: string; count?: number }, now = new Date()): Moved {
  if (!c.sourceId || !c.ref || !TARGETS.some(([k]) => k === c.to)) throw Error('Taşınacak kalem bulunamadı.');
  // The item was made by the dictation itself or by an earlier move of the same item.
  const to = c.to as Exclude<Kind, 'record'>, sources = n.changes.filter(x => x.sourceId === c.sourceId || (x.moved?.sourceId === c.sourceId && x.moved?.newRef === c.ref));
  const born = (key: string, has: (v: unknown) => boolean) => sources.some(source => source.ops.some(o => o.key === key && !o.undone && !has(o.before) && has(o.after)));
  const [type, a, b] = c.ref.split(':');
  let text = '', from: Kind, frontId: string | null = null, remove = () => {};
  switch (type) {
    case 'move': {
      const f = n.fronts[a], m = f?.moves.find(x => x.id === b && !x.doneAt);
      if (!f || !m) throw Error('Hamle bulunamadı ya da tamamlandı.');
      text = m.text; from = 'move'; frontId = f.id;
      if (born('front:' + f.id, v => !!(v as Front | null)?.moves.some(x => x.id === b))) remove = () => {
        f.moves = f.moves.filter(x => x.id !== b);
        if (born('front:' + f.id, v => !!v) && !f.moves.length) { delete n.fronts[f.id]; dropSlots(n, f.id, now); frontId = null; } else replaceSlot(n, f);
      };
      break;
    }
    case 'routine': {
      const r = n.routines?.[a];
      if (!r) throw Error('Rutin bulunamadı.');
      text = r.title; from = 'routine';
      if (born('routines', v => !!(v as RoutinesValue | null)?.routines?.[a])) remove = () => {
        if (n.running?.routineId === a) throw Error('Önce süren sayacı bitir.');
        delete n.routines![a]; n.sessions = (n.sessions ?? []).filter(x => x.routineId !== a); n.skips = (n.skips ?? []).filter(k => k.routineId !== a);
      };
      break;
    }
    case 'session': {
      const x = (n.sessions ?? []).find(y => y.id === a), r = x && n.routines?.[x.routineId];
      if (!x || !r) throw Error('Kayıt bulunamadı.');
      if (to === 'routine') throw Error('Bu zaten bir rutinin kaydı.');
      text = r.title; from = 'record';
      if (born('routines', v => !!(v as RoutinesValue | null)?.sessions?.some(y => y.id === a))) remove = () => { n.sessions = n.sessions!.filter(y => y.id !== a); };
      break;
    }
    case 'event': {
      const e = n.events?.[a];
      if (!e || e.cancelled) throw Error('Tarihli kalem bulunamadı.');
      text = e.title; from = 'event'; frontId = e.frontId;
      if (born('calendar', v => !!(v as { events?: Record<string, CalendarEvent> } | null)?.events?.[a])) remove = () => { delete n.events![a]; syncPlans(n, calendarDay(now)); };
      break;
    }
    case 'idea': {
      const i = n.ideas?.[a];
      if (!i || i.status !== 'stored') throw Error('Depo kalemi bulunamadı.');
      text = i.text; from = 'idea'; frontId = i.laneId;
      if (born('research', v => !!(v as { ideas?: Record<string, Idea> } | null)?.ideas?.[a])) remove = () => { delete n.ideas![a]; };
      break;
    }
    default: throw Error('Bu kalemin türü değişmez.');
  }
  if (from === to) throw Error('Kalem zaten bu türde.');
  remove();
  const at = now.toISOString(), title = routineTitle(text);
  let moved: Omit<Moved, 'sourceId' | 'ref' | 'to'>;
  switch (to) {
    case 'move': {
      const open = (f?: Front) => f && f.status !== 'closed' ? f : undefined;
      let f = open(frontId ? n.fronts[frontId] : undefined) ?? Object.values(n.fronts).find(x => x.status !== 'closed' && canonicalTitle(x.title) === canonicalTitle(title));
      if (!f) { f = { id: uid(), title, type: 'general', status: 'active', moves: [], where: '', question: '', notes: [], touched: at }; n.fronts[f.id] = f; }
      const m = { id: uid(), text: (from === 'routine' || from === 'record' ? `${title} yap.` : text).slice(0, 120) };
      f.moves.push(m); f.touched = at;
      moved = { newRef: `move:${f.id}:${m.id}`, key: 'front:' + f.id, text: m.text, note: f.title };
      break;
    }
    case 'routine': {
      if (!c.count) throw Error('Haftada kaç kez?');
      if (findRoutine(n, title)) throw Error('Bu adla bir rutin var.');
      const r = newRoutine(title, c.count, now);
      (n.routines ??= {})[r.id] = r;
      moved = { newRef: `routine:${r.id}`, key: 'routines', text: `${r.title} · ${countText(r.count)}`, note: 'Gözlem başladı' };
      break;
    }
    case 'event': {
      const id = uid(), e: CalendarEvent = { id, title: text.replace(/[.!]+$/, '').slice(0, 90), kind: 'appointment', frontId: frontId && n.fronts[frontId] ? frontId : null, date: null, time: null, endTime: null, location: '', bring: [], weekly: false, prepDays: null, documents: [], institution: '', program: '', portal: '' };
      (n.events ??= {})[id] = e;
      moved = { newRef: `event:${id}`, key: 'calendar', text: e.title, note: 'Tarihi belli değil · Ufuk’ta düzenlenir' };
      break;
    }
    case 'idea': {
      const id = uid(), lane = frontId && n.fronts[frontId]?.type === 'lane' && n.fronts[frontId].status !== 'closed' ? frontId : null;
      (n.ideas ??= {})[id] = { id, text: text.slice(0, 1200), kind: 'idea', laneId: lane, createdAt: at, sourceId: c.sourceId, status: 'stored' };
      moved = { newRef: `idea:${id}`, key: 'research', text, note: lane ? n.fronts[lane].title : 'Sahipsiz' };
      break;
    }
  }
  (n.kindPreferences ??= []).push({ text, from, to, at });
  return { sourceId: c.sourceId, ref: c.ref, to, ...moved };
}

/** “Bu cephe ne?” (C3): the type changes on the front page only, one tap. A held front leaving Proje becomes
 *  active and its ideas go to “sahipsiz” (kept); “Rutin” moves it to Rutinler and closes the front. The camp
 *  keeps the old type's place reserved (Front.was) and takes a lasting place in its new region. */
export function retype(n: State, c: { frontId?: string; type?: string; count?: number }, now = new Date()) {
  const f = n.fronts[c.frontId ?? ''];
  if (!f) throw Error('Cephe bulunamadı.');
  const to = c.type as FrontType | 'routine';
  if (!['course', 'lane', 'application', 'general', 'routine'].includes(to)) throw Error('Geçersiz tür.');
  if (to === f.type) throw Error('Cephe zaten bu türde.');
  const from = f.type;
  if (to !== 'lane') for (const i of Object.values(n.ideas ?? {})) if (i.laneId === f.id) i.laneId = null;
  if (to === 'routine') {
    if (!c.count) throw Error('Haftada kaç kez?');
    if (findRoutine(n, f.title)) throw Error('Bu adla bir rutin var.');
    const r = newRoutine(f.title, c.count, now);
    (n.routines ??= {})[r.id] = r;
    f.status = 'closed'; f.closedAt ??= now.toISOString();
    dropSlots(n, f.id, now);
  } else {
    (f.was ??= []).push(f.type);
    f.type = to;
    if (f.status === 'held' && to !== 'lane') f.status = 'active';
  }
  f.touched = now.toISOString();
  (n.typePreferences ??= []).push({ title: f.title, from, to, at: now.toISOString() });
}

// Where each front camps on the expedition map, and how urgent it is.
// Positions are persistent: they depend only on the front's id, its type and the fronts created before
// it, so a new front never moves the old ones. Closed fronts keep their place.

import { C, pdist, type Pt } from './terrain';
import type { Front, FrontType, State } from '../domain';
import { addDays, calendarDay, daysBetween, occurrences, type CalendarEvent } from '../calendar';
import { MO, WD } from '../turkish';

export const REGIONS: Record<FrontType, { label: string; region: string; name: string }> = {
  course: { label: 'DERSLER', region: 'DERS OVASI', name: 'Ders Ovası' },
  lane: { label: 'KULVARLAR', region: 'KULVAR DAĞLARI', name: 'Kulvar Dağları' },
  application: { label: 'BAŞVURULAR', region: 'BAŞVURU GEÇİDİ', name: 'Başvuru Geçidi' },
  general: { label: 'GENEL', region: 'GENEL DÜZLÜK', name: 'Genel Düzlük' },
};

// Hand-picked spots from the design. The n-th front of a type tries the n-th spot first, so the first
// fronts of each type sit where the design put them; later ones use candidates seeded by their id.
const SLOTS: Record<FrontType, Pt[]> = {
  general: [[270, 590], [310, 470], [300, 740], [440, 790]],
  course: [[180, 900], [380, 960], [610, 895], [260, 1080], [600, 1095]],
  lane: [[230, 330], [420, 250], [120, 240], [560, 120], [320, 95]],
  application: [[547, 544], [691, 408], [730, 143], [856, -20]],
};

export const CAMP_GAP = 58;
const HQ_GAP = 100;

/** Whether a point lies in the region of its front type. */
export function inRegion(type: FrontType, [x, y]: Pt): boolean {
  const hq = Math.hypot(x - C.HQ[0], y - C.HQ[1]);
  if (hq < HQ_GAP) return false;
  switch (type) {
    // Genel Düzlük: the open ground around the headquarters, off the valley and the river.
    case 'general': return hq <= 250 && y >= 440 && y <= 840 && pdist(x, y, C.VAL).d >= 60 && pdist(x, y, C.RIVER).d >= 40;
    // Ders Ovası: the southern plain, clear of the river.
    case 'course': return x >= 80 && x <= 720 && y >= 860 && y <= 1200 && pdist(x, y, C.RIVER).d >= 45;
    // Kulvar Dağları: the mountains in the north, clear of the valley.
    case 'lane': return x >= 40 && x <= 640 && y >= 60 && y <= 380 && pdist(x, y, C.VAL).d >= 90;
    // Başvuru Geçidi: along the valley floor up to the pass and beyond.
    case 'application': { const v = pdist(x, y, C.VAL); return v.d <= 46 && v.s >= 40 && v.s <= 830 && hq >= 130; }
  }
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function along(P: Pt[], s: number): { p: Pt; tg: Pt } {
  let acc = 0;
  for (let i = 0; i < P.length - 1; i++) {
    const dx = P[i + 1][0] - P[i][0], dy = P[i + 1][1] - P[i][1], L = Math.hypot(dx, dy);
    if (acc + L >= s) { const t = (s - acc) / L; return { p: [P[i][0] + dx * t, P[i][1] + dy * t], tg: [dx / L, dy / L] }; }
    acc += L;
  }
  const n = P.length - 1, dx = P[n][0] - P[n - 1][0], dy = P[n][1] - P[n - 1][1], L = Math.hypot(dx, dy);
  return { p: P[n], tg: [dx / L, dy / L] };
}

function randomSpot(type: FrontType, rnd: () => number): Pt {
  switch (type) {
    case 'general': { const a = rnd() * Math.PI * 2, r = 115 + rnd() * 130; return [C.HQ[0] + Math.cos(a) * r, C.HQ[1] + Math.sin(a) * r]; }
    case 'course': return [90 + rnd() * 620, 870 + rnd() * 320];
    case 'lane': return [50 + rnd() * 580, 70 + rnd() * 300];
    case 'application': { const { p, tg } = along(C.VAL, 50 + rnd() * 770), o = (rnd() - 0.5) * 84; return [p[0] - tg[1] * o, p[1] + tg[0] * o]; }
  }
}

function candidates(f: Pick<Front, 'id' | 'type'>, nth: number): Pt[] {
  const rnd = mulberry32(hash(f.id)), anchors = SLOTS[f.type], out: Pt[] = [];
  for (let i = 0; i < anchors.length; i++) out.push(anchors[(nth + i) % anchors.length]);
  for (let tries = 0; out.length < anchors.length + 60 && tries < 600; tries++) {
    const p = randomSpot(f.type, rnd);
    if (inRegion(f.type, p)) out.push([Math.round(p[0]), Math.round(p[1])]);
  }
  return out;
}

/**
 * Places fronts in creation order (the key order of `state.fronts`). Each front takes the first of its
 * candidates that keeps CAMP_GAP from every camp placed before it; when a region is crowded the gap
 * shrinks step by step, so there is never a limit on the number of fronts.
 */
export function placeCamps(fronts: Pick<Front, 'id' | 'type'>[]): Record<string, Pt> {
  const out: Record<string, Pt> = {}, placed: Pt[] = [], count: Partial<Record<FrontType, number>> = {};
  const room = (p: Pt) => placed.reduce((m, q) => Math.min(m, Math.hypot(p[0] - q[0], p[1] - q[1])), Infinity);
  for (const f of fronts) {
    const nth = count[f.type] = (count[f.type] ?? -1) + 1, cands = candidates(f, nth);
    let spot: Pt | undefined;
    for (const gap of [CAMP_GAP, 50, 42, 34, 26]) { spot = cands.find(p => room(p) >= gap); if (spot) break; }
    spot ??= cands.reduce((best, p) => room(p) > room(best) ? p : best, cands[0]);
    out[f.id] = spot;
    placed.push(spot);
  }
  return out;
}

export type Urgency = 'done' | 'crit' | 'near' | 'calm';
export const KRITIK: number = 2, YAKLASAN: number = 7;

/**
 * The front's nearest dated item from today on. Class sessions and weekly recurring items are schedule,
 * not deadlines, so they do not make a camp urgent; cancelled and undated items are ignored.
 */
export function nextDated(s: State, frontId: string, today = calendarDay()): { event: CalendarEvent; days: number } | null {
  const own = Object.values(s.events ?? {}).filter(e => e.frontId === frontId && e.kind !== 'class' && !e.weekly);
  const next = occurrences(own, today, addDays(today, 3650))[0];
  return next ? { event: next, days: daysBetween(today, next.date!) } : null;
}

export function urgency(f: Pick<Front, 'status'>, days: number | null, done: boolean): Urgency {
  if (done) return 'done';
  if (f.status === 'held' || days == null) return 'calm';
  return days <= KRITIK ? 'crit' : days <= YAKLASAN ? 'near' : 'calm';
}

export function daysTag(f: Pick<Front, 'status'>, days: number | null) {
  if (f.status === 'held') return 'BEKLETİLİYOR';
  if (days == null) return 'TARİHSİZ';
  if (days === 0) return 'BUGÜN';
  if (days === 1) return 'YARIN';
  return days + ' GÜN';
}

/** “Sal 29 Eyl · 10:00” */
export function whenText(e: Pick<CalendarEvent, 'date' | 'time'>) {
  if (!e.date) return '';
  const d = new Date(e.date + 'T12:00:00Z');
  return WD[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + MO[d.getUTCMonth()] + (e.time ? ' · ' + e.time : '');
}

/** “10:12”, Istanbul time. */
export function clockText(iso: string) {
  return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' });
}

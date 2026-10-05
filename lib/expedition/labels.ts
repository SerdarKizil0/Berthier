// Label placement on the expedition map, ported from the design reference (placeLabels, regionLabels,
// genelArc, genelFlat). Works in screen pixels. Text widths come from the caller (`tw`), so the module
// stays free of the DOM.

import { C, type Box, type Pt, type RegionCands } from './terrain';

export type TextWidth = (text: string, font: string) => number;

export type Mark = {
  id?: string; x: number; y: number; r: number;
  w?: number; h?: number; prio?: number; force?: boolean; alt?: [number, number] | null;
  lab?: [number, number] | null; compact?: boolean;
};

export type Placement = { boxes: Box[]; placed: Box[]; hits: (b: Box) => boolean };

const overlaps = (b: Box, q: Box) => b[0] < q[2] && b[2] > q[0] && b[1] < q[3] && b[3] > q[1];

/**
 * Puts each mark's label in one of eight positions around it, highest priority first. A position is
 * refused when it would sit closer to another camp than to its own (by ~10 px), leave the frame or cover
 * something placed earlier. `force` labels (selected camp, GEÇİLDİ seals) always get the best compromise.
 * `between` runs once, when the remaining labels drop below priority 45 (region names go there); its
 * result is returned next to the placement.
 */
export function placeLabels<T>(marks: Mark[], w: number, h: number, extra: Box[], between?: (api: Placement) => T): {api: Placement; between: T | undefined} {
  const boxes: Box[] = marks.map(m => [m.x - m.r, m.y - m.r, m.x + m.r, m.y + m.r] as Box).concat(extra), placed: Box[] = [];
  const hits = (b: Box) => boxes.some(q => overlaps(b, q)) || placed.some(q => overlaps(b, q));
  const api: Placement = { boxes, placed, hits };
  const rd = (b: Box, q: Mark) => Math.hypot(Math.max(b[0] - q.x, 0, q.x - b[2]), Math.max(b[1] - q.y, 0, q.y - b[3]));
  const owns = (m: Mark, b: Box) => { const d = rd(b, m) + 10; for (const q of marks) if (q !== m && rd(b, q) < d) return false; return true; };
  const tryAt = (m: Mark, mw: number, mh: number, gg: number, own: boolean): [number, number] | null => {
    const g = gg || m.r + 3;
    const cands: [number, number][] = [[-mw / 2, g], [g, -mh / 2], [-g - mw, -mh / 2], [-mw / 2, -g - mh], [g - 2, g - 2], [-g - mw + 2, g - 2], [g - 2, -g - mh + 2], [-g - mw + 2, -g - mh + 2]];
    for (const [dx, dy] of cands) {
      const b: Box = [m.x + dx, m.y + dy, m.x + dx + mw, m.y + dy + mh];
      if (b[0] < 2 || b[2] > w - 2 || b[1] < 2 || b[3] > h - 2) continue;
      if (!hits(b) && (!own || owns(m, b))) { placed.push(b); return [dx, dy]; }
    }
    return null;
  };
  let did = false, result: T | undefined;
  for (const m of marks.filter(m => m.w).sort((a, b) => (b.prio ?? 0) - (a.prio ?? 0))) {
    if (!did && (m.prio ?? 0) < 45) { did = true; result = between?.(api); }
    m.lab = null;
    m.compact = false;
    if (m.x < -20 || m.x > w + 20 || m.y < -20 || m.y > h + 20) continue;
    m.lab = tryAt(m, m.w!, m.h!, 0, true);
    if (!m.lab && m.alt) {
      for (const gg of [m.r + 3, m.r + 15]) { m.lab = tryAt(m, m.alt[0], m.alt[1], gg, true); if (m.lab) { m.compact = true; break; } }
    }
    if (!m.lab && m.force) {
      const fw = m.alt ? m.alt[0] : m.w!, fh = m.alt ? m.alt[1] : m.h!, mi = marks.indexOf(m), own = boxes[mi], hq = mi === 0 ? null : boxes[0], all = boxes.concat(placed);
      let best: [number, number, Box] | null = null, bk: number[] | null = null;
      for (const gg of [m.r + 3, m.r + 12]) {
        for (const [dx, dy] of [[-fw / 2, gg], [gg, -fh / 2], [-gg - fw, -fh / 2], [-fw / 2, -gg - fh], [gg - 2, gg - 2], [-gg - fw + 2, gg - 2], [gg - 2, -gg - fh + 2], [-gg - fw + 2, -gg - fh + 2]]) {
          const x0 = Math.min(Math.max(m.x + dx, 2), w - 2 - fw), y0 = Math.min(Math.max(m.y + dy, 2), h - 2 - fh), bx: Box = [x0, y0, x0 + fw, y0 + fh];
          if (hq && overlaps(bx, hq)) continue;
          let ov = 0, onOwn = 0;
          for (const q of all) {
            const ox = Math.min(bx[2], q[2]) - Math.max(bx[0], q[0]), oy = Math.min(bx[3], q[3]) - Math.max(bx[1], q[1]);
            if (ox > 0 && oy > 0) { if (q === own) onOwn = ox * oy; else ov += ox * oy; }
          }
          const dOwn = rd(bx, m);
          let dOth = Infinity;
          for (const q of marks) if (q !== m) dOth = Math.min(dOth, rd(bx, q));
          // Unlike the reference, a label pushed against the frame edge onto its own camp comes last: it would
          // hide the flag it describes.
          const key = [onOwn ? 0 : 1, dOth - dOwn >= 10 ? 1 : 0, Math.min(dOth - dOwn, 10), -ov, -dOwn];
          let better = !bk;
          for (let i = 0; !better && i < key.length; i++) { if (key[i] > bk![i]) better = true; else if (key[i] < bk![i]) break; }
          if (better) { bk = key; best = [x0 - m.x, y0 - m.y, bx]; }
        }
      }
      if (!best) { const g = m.r + 3; best = [-fw / 2, g, [m.x - fw / 2, m.y + g, m.x + fw / 2, m.y + g + fh]]; }
      m.lab = [best[0], best[1]];
      m.compact = !!m.alt;
      placed.push(best[2]);
    }
  }
  if (!did) result = between?.(api);
  return {api, between: result};
}

export type Size = { w: number; h: number };
export type Project = (p: Pt) => Pt;
export type TextPlace = { tf: string; on: boolean };
export const NO_TEXT: TextPlace = { tf: 'translate(-999 -999)', on: false };

const REGION_FONT: [number, number][] = [[13, 0.22], [13, 0.22], [12, 0.16]];

/** Proje Dağları, Ders Ovası and Başvuru Geçidi: the first candidate whose letters stay clear. */
export function regionLabels(PL: Placement, S: Project, sz: Size, top: number, bot: number, legHit: (b: Box) => boolean, prev: TextPlace[] | null, cands: RegionCands, tw: TextWidth): TextPlace[] {
  return cands.map(([text, list], ri) => {
    if (prev && prev[ri].on) return prev[ri];
    const [size, spacing] = REGION_FONT[ri], w = tw(text, 'italic 400 ' + size + "px 'Instrument Serif'") + text.length * size * spacing;
    for (const [x, y, ang] of list) {
      const c = S([x, y]);
      if (c[0] < 0 || c[0] > sz.w || c[1] < top || c[1] > bot) continue;
      const a = ang * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a), boxes: Box[] = [];
      let ok = true;
      for (let s = -w / 2; s <= w / 2 + 0.1; s += 8) {
        const px = c[0] + ca * s, py = c[1] + sa * s, b: Box = [px - 5, py - 6, px + 5, py + 6];
        if (b[0] < 4 || b[2] > sz.w - 4 || b[1] < top || b[3] > bot || PL.hits(b) || legHit(b)) { ok = false; break; }
        boxes.push(b);
      }
      if (ok) { PL.placed.push(...boxes); return { tf: 'translate(' + c[0].toFixed(1) + ' ' + c[1].toFixed(1) + ') rotate(' + ang + ')', on: true }; }
    }
    return NO_TEXT;
  });
}

const GENEL = 'İŞ DÜZLÜĞÜ';
const genelWidth = (tw: TextWidth) => tw(GENEL, "italic 400 12px 'Instrument Serif'") + GENEL.length * 12 * 0.16;

/** İş Düzlüğü written straight, close to the headquarters (fallback when no arc fits). */
export function genelFlat(PL: Placement, S: Project, sz: Size, top: number, bot: number, tw: TextWidth): TextPlace {
  const w = genelWidth(tw), c = S(C.HQ);
  for (const [ox, oy] of [[0, 52], [0, -32], [0, 68], [0, -48], [-84, -26], [84, -26], [-84, 54], [84, 54]]) {
    const x = c[0] + ox, y = c[1] + oy, b: Box = [x - w / 2, y - 7, x + w / 2, y + 7];
    if (b[0] < 4 || b[2] > sz.w - 4 || b[1] < top || b[3] > bot || PL.hits(b)) continue;
    PL.placed.push(b);
    return { tf: 'translate(' + x.toFixed(1) + ' ' + y.toFixed(1) + ')', on: true };
  }
  return NO_TEXT;
}

/** İş Düzlüğü along an arc around the headquarters. Returns the arc path for a <textPath>. */
export function genelArc(PL: Placement, S: Project, k: number, sz: Size, top: number, bot: number, legHit: (b: Box) => boolean, tw: TextWidth): { arc: string; on: boolean } {
  const w = genelWidth(tw), c = S(C.HQ);
  for (const [rw, up] of C.ARC) {
    const r = rw * k;
    if (w / r > 2.4) continue;
    const mid = up ? -Math.PI / 2 : Math.PI / 2, boxes: Box[] = [];
    let ok = true;
    for (let s = -w / 2; s <= w / 2 + 0.1; s += 8) {
      const th = up ? mid + s / r : mid - s / r, px = c[0] + Math.cos(th) * r, py = c[1] + Math.sin(th) * r, b: Box = [px - 5, py - 6, px + 5, py + 6];
      if (b[0] < 4 || b[2] > sz.w - 4 || b[1] < top || b[3] > bot || PL.hits(b) || legHit(b)) { ok = false; break; }
      boxes.push(b);
    }
    if (!ok) continue;
    PL.placed.push(...boxes);
    const a0 = up ? mid - 1.25 : mid + 1.25, a1 = up ? mid + 1.25 : mid - 1.25;
    return { arc: 'M' + (c[0] + Math.cos(a0) * r).toFixed(1) + ' ' + (c[1] + Math.sin(a0) * r).toFixed(1) + 'A' + r.toFixed(1) + ' ' + r.toFixed(1) + ' 0 0 ' + (up ? 1 : 0) + ' ' + (c[0] + Math.cos(a1) * r).toFixed(1) + ' ' + (c[1] + Math.sin(a1) * r).toFixed(1), on: true };
  }
  return { arc: 'M0 0', on: false };
}

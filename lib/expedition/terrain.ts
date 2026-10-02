// Expedition map terrain: a TypeScript port of the logic class in
// design-reference/project/Berthier Harita v7.dc.html. Function names and constants follow the
// reference so the two can be compared side by side. Everything here is pure and deterministic
// (no DOM), so it runs the same in a Web Worker, on the main thread and in tests.

export type Pt = [number, number];
export type Box = [number, number, number, number];

// World: coordinates in map units, the headquarters, the ridge line in the north, the valley that
// climbs north-east (with its pass), the river that leaves the valley southwards, the southern hills
// and a separate rise in the south-east.
export const C = {
  X0: -380, Y0: -420, X1: 1180, Y1: 1520, ST: 6, PS: 12, LV: 0.036,
  HQ: [400, 640] as Pt,
  RIDGE: [[-420, 300], [-150, 250], [100, 175], [300, 225], [470, 135], [640, 190], [860, 110], [1200, 60]] as Pt[],
  VAL: [[520, 660], [590, 530], [660, 400], [715, 270], [770, 130], [840, -60], [900, -260]] as Pt[],
  PASS: 560,
  RIVER: [[760, 155], [741, 205], [715, 270], [690, 335], [660, 400], [627, 462], [590, 530], [556, 594], [520, 660], [512, 715], [528, 770], [534, 825], [515, 878], [492, 930], [470, 990], [458, 1048], [436, 1108], [404, 1168], [380, 1240], [352, 1320], [336, 1420], [318, 1540]] as Pt[],
  HILLS: [[160, 880, 0.06, 120], [420, 1010, 0.045, 150], [650, 940, 0.07, 110], [250, 1190, 0.055, 130], [600, 1230, 0.05, 140], [40, 1060, 0.06, 110], [-120, 820, 0.08, 140]] as [number, number, number, number][],
  SE: [950, 640, 0.52, 210] as [number, number, number, number],
  ARC: [[130, 0], [130, 1], [145, 0], [145, 1], [160, 0], [160, 1], [180, 0], [180, 1], [200, 0], [200, 1], [220, 0], [220, 1], [245, 0], [245, 1], [270, 0], [270, 1]] as [number, number][],
};

// Hypsometric ramp (height → RGB) and hillshade of the Grafit Gece palette.
export const RELIEF = {
  HY: [[0, [20, 21, 23]], [0.07, [25, 26, 28]], [0.095, [28, 29, 31]], [0.16, [31, 32, 34]], [0.3, [36, 37, 39]], [0.5, [42, 43, 46]], [0.75, [49, 50, 53]], [1, [57, 58, 61]], [1.3, [70, 71, 74]]] as [number, [number, number, number]][],
  hlc: [95, 96, 98] as [number, number, number],
  hs: 0.35,
  ds: 0.5,
};

export const ss = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const smin = (a: number, b: number, k: number) => {
  const q = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - q * q * k * 0.25;
};

/** Distance from (x, y) to polyline P, and the arc length `s` of the closest point along P. */
export function pdist(x: number, y: number, P: Pt[]) {
  let bd = Infinity, bs = 0, acc = 0;
  for (let i = 0; i < P.length - 1; i++) {
    const ax = P[i][0], ay = P[i][1], dx = P[i + 1][0] - ax, dy = P[i + 1][1] - ay, L2 = dx * dx + dy * dy, L = Math.sqrt(L2);
    let t = ((x - ax) * dx + (y - ay) * dy) / L2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = ax + dx * t - x, ey = ay + dy * t - y, d = ex * ex + ey * ey;
    if (d < bd) { bd = d; bs = acc + t * L; }
    acc += L;
  }
  return { d: Math.sqrt(bd), s: bs };
}

const perm = (() => {
  const a: number[] = [];
  for (let i = 0; i < 256; i++) a.push(i);
  let s = 1337;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; }
  const p = new Uint8Array(512);
  for (let i = 0; i < 512; i++) p[i] = a[i & 255];
  return p;
})();

function grad(q: number, dx: number, dy: number) {
  switch (q & 7) {
    case 0: return dx + dy;
    case 1: return dy - dx;
    case 2: return dx - dy;
    case 3: return -dx - dy;
    case 4: return dx;
    case 5: return -dx;
    case 6: return dy;
    default: return -dy;
  }
}

/** 2-D gradient noise. */
export function n2(x: number, y: number) {
  const p = perm, X = Math.floor(x), Y = Math.floor(y), fx = x - X, fy = y - Y, xi = X & 255, yi = Y & 255;
  const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10), v = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const A = p[xi] + yi, B = p[xi + 1] + yi;
  const g00 = grad(p[A], fx, fy), g10 = grad(p[B], fx - 1, fy), g01 = grad(p[A + 1], fx, fy - 1), g11 = grad(p[B + 1], fx - 1, fy - 1);
  const x1 = g00 + (g10 - g00) * u, x2 = g01 + (g11 - g01) * u;
  return x1 + (x2 - x1) * v;
}

function fbm(x: number, y: number, o: number, sd: number) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < o; i++) { s += a * n2(x * f + sd * (i + 1), y * f - sd * (i + 1) * 0.7); f *= 2.03; a *= 0.5; }
  return s;
}

function ridged(x: number, y: number) {
  let r = 0, a = 0.5, f = 1, w = 1;
  for (let i = 0; i < 4; i++) {
    let q = 1 - Math.abs(n2(x * f + i * 17.3, y * f - i * 9.1));
    q *= q; q *= w;
    w = Math.min(1, Math.max(0, q * 2));
    r += q * a; f *= 2.05; a *= 0.5;
  }
  return r / 0.94;
}

/** Elevation: domain-warped fBm base, hills, ridged mountains near the ridge line, carved river and valley. */
export function height(x: number, y: number) {
  const wx = x + 70 * n2(x / 420 + 3.1, y / 420 + 7.7), wy = y + 70 * n2(x / 420 + 11.3, y / 420 + 1.9);
  let h = 0.115 + 0.05 * fbm(wx / 300, wy / 300, 3, 5.2);
  for (const q of C.HILLS) { const dx = wx - q[0], dy = wy - q[1]; h += q[2] * Math.exp(-(dx * dx + dy * dy) / (2 * q[3] * q[3])); }
  {
    const q = C.SE, dx = wx - q[0], dy = wy - q[1], e = Math.exp(-(dx * dx + dy * dy) / (2 * q[3] * q[3]));
    if (e > 0.01) h += q[2] * e * (0.7 + 0.5 * fbm(wx / 150, wy / 150, 3, 9.1));
  }
  const mm = ss(340, 40, pdist(wx, wy, C.RIDGE).d);
  if (mm > 0) h += Math.pow(mm, 1.25) * (0.16 + 0.84 * ridged(wx / 210, wy / 210));
  const pr = pdist(x, y, C.RIVER), south = ss(680, 900, y);
  if (south > 0) h += 0.055 * Math.min(1, pr.d / 340) * south;
  const pv = pdist(x, y, C.VAL), fl = 0.05 + 0.3 * Math.exp(-Math.pow((pv.s - C.PASS) / 115, 2));
  h = smin(h, fl + 0.95 * Math.pow(pv.d / 170, 1.5), 0.09);
  const fq = ss(265, 125, Math.hypot(x - C.HQ[0], y - C.HQ[1]));
  if (fq > 0) h = h * (1 - fq) + (0.095 + 0.006 * n2(x / 90, y / 90)) * fq;
  h -= 0.014 * Math.exp(-(pr.d * pr.d) / 512);
  const e = Math.min(x - C.X0, C.X1 - x, y - C.Y0, C.Y1 - y);
  return 0.09 + (h - 0.09) * ss(0, 240, e);
}

/** Ramer–Douglas–Peucker simplification. */
export function rdp(P: Pt[], eps: number, closed: boolean): Pt[] {
  if (P.length < 3) return P;
  if (closed) {
    let far = 0, fd = -1;
    for (let i = 1; i < P.length; i++) { const d = (P[i][0] - P[0][0]) ** 2 + (P[i][1] - P[0][1]) ** 2; if (d > fd) { fd = d; far = i; } }
    const a = rdp(P.slice(0, far + 1), eps, false), b = rdp(P.slice(far).concat([P[0]]), eps, false);
    return a.slice(0, -1).concat(b.slice(0, -1));
  }
  const keep = new Uint8Array(P.length);
  keep[0] = keep[P.length - 1] = 1;
  const st: [number, number][] = [[0, P.length - 1]];
  while (st.length) {
    const [s, e] = st.pop()!, ax = P[s][0], ay = P[s][1], dx = P[e][0] - ax, dy = P[e][1] - ay, L = Math.hypot(dx, dy) || 1e-9;
    let md = -1, mi = -1;
    for (let i = s + 1; i < e; i++) { const d = Math.abs((P[i][0] - ax) * dy - (P[i][1] - ay) * dx) / L; if (d > md) { md = d; mi = i; } }
    if (md > eps) { keep[mi] = 1; st.push([s, mi], [mi, e]); }
  }
  return P.filter((_, i) => keep[i]);
}

const f1 = (v: number) => Math.round(v * 10) / 10;

/** Closed Catmull-Rom spline as an SVG path. */
export function crC(p: Pt[]) {
  const n = p.length;
  let d = 'M' + f1(p[0][0]) + ' ' + f1(p[0][1]);
  for (let i = 0; i < n; i++) {
    const p0 = p[(i - 1 + n) % n], p1 = p[i], p2 = p[(i + 1) % n], p3 = p[(i + 2) % n];
    d += 'C' + f1(p1[0] + (p2[0] - p0[0]) / 6) + ' ' + f1(p1[1] + (p2[1] - p0[1]) / 6) + ' ' + f1(p2[0] - (p3[0] - p1[0]) / 6) + ' ' + f1(p2[1] - (p3[1] - p1[1]) / 6) + ' ' + f1(p2[0]) + ' ' + f1(p2[1]);
  }
  return d + 'Z';
}

/** Open Catmull-Rom spline as an SVG path. */
export function crO(p: Pt[]) {
  const n = p.length;
  let d = 'M' + f1(p[0][0]) + ' ' + f1(p[0][1]);
  for (let i = 0; i < n - 1; i++) {
    const p0 = p[Math.max(0, i - 1)], p1 = p[i], p2 = p[i + 1], p3 = p[Math.min(n - 1, i + 2)];
    d += 'C' + f1(p1[0] + (p2[0] - p0[0]) / 6) + ' ' + f1(p1[1] + (p2[1] - p0[1]) / 6) + ' ' + f1(p2[0] - (p3[0] - p1[0]) / 6) + ' ' + f1(p2[1] - (p3[1] - p1[1]) / 6) + ' ' + f1(p2[0]) + ' ' + f1(p2[1]);
  }
  return d;
}

/** Resamples a polyline so that no segment is longer than `mx`. */
function dens(pts: Pt[], closed: boolean, mx: number) {
  const out: Pt[] = [], n = pts.length, m = closed ? n : n - 1;
  for (let i = 0; i < m; i++) {
    const a = pts[i], b = pts[(i + 1) % n], s = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / mx));
    for (let j = 0; j < s; j++) out.push([a[0] + (b[0] - a[0]) * j / s, a[1] + (b[1] - a[1]) * j / s]);
  }
  if (!closed) out.push(pts[n - 1]);
  return out;
}

export type Poly = { pts: Pt[]; closed: boolean; bb: Box; d: string };
export type Level = { L: number; index: boolean; polys: Poly[]; d: string };
export type Geo = {
  H: Float32Array; nx: number; ny: number;
  levels: Level[]; stipple: string; river: string; peaks: [number, number, number][];
  PH: Float32Array; PR: Float32Array; pnx: number; pny: number;
};

/** Bilinear height lookup on the sampled grid. */
export function hAt(g: Pick<Geo, 'H' | 'nx' | 'ny'>, x: number, y: number) {
  const { H, nx, ny } = g, st = C.ST;
  const gx = (x - C.X0) / st, gy = (y - C.Y0) / st, i = Math.max(0, Math.min(nx - 2, Math.floor(gx))), j = Math.max(0, Math.min(ny - 2, Math.floor(gy))), fx = gx - i, fy = gy - j, o = j * nx + i;
  return (H[o] * (1 - fx) + H[o + 1] * fx) * (1 - fy) + (H[o + nx] * (1 - fx) + H[o + nx + 1] * fx) * fy;
}

type Seg = { p: Pt; n: number[] };

/**
 * Samples the height field, traces contours (marching squares, RDP, Catmull-Rom), scatters the plain's
 * stipple, finds three peaks and prepares the coarse grids used by the path finder. A generator so that
 * callers can spread the work over several tasks; it yields between chunks.
 */
export function* geoSteps(): Generator<void, Geo, void> {
  const st = C.ST, nx = Math.round((C.X1 - C.X0) / st) + 1, ny = Math.round((C.Y1 - C.Y0) / st) + 1, H = new Float32Array(nx * ny);
  let hmax = 0;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) { const v = height(C.X0 + i * st, C.Y0 + j * st); H[j * nx + i] = v; if (v > hmax) hmax = v; }
    if (j % 2 === 1) yield;
  }
  const LV = C.LV, NL = Math.floor(hmax / LV), maps: Map<number, Seg>[] = [];
  for (let l = 0; l <= NL; l++) maps.push(new Map());
  const add = (M: Map<number, Seg>, k1: number, p1: Pt, k2: number, p2: Pt) => {
    let a = M.get(k1); if (!a) { a = { p: p1, n: [] }; M.set(k1, a); } a.n.push(k2);
    let b = M.get(k2); if (!b) { b = { p: p2, n: [] }; M.set(k2, b); } b.n.push(k1);
  };
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const o = j * nx + i, a = H[o], b = H[o + 1], c = H[o + nx + 1], d = H[o + nx];
      const l0 = Math.max(1, Math.ceil(Math.min(a, b, c, d) / LV)), l1 = Math.min(NL, Math.floor(Math.max(a, b, c, d) / LV));
      if (l0 > l1) continue;
      const x0 = C.X0 + i * st, y0 = C.Y0 + j * st, kT = o * 2, kL = o * 2 + 1, kR = (o + 1) * 2 + 1, kB = (o + nx) * 2;
      for (let l = l0; l <= l1; l++) {
        const L = l * LV, code = (a > L ? 8 : 0) | (b > L ? 4 : 0) | (c > L ? 2 : 0) | (d > L ? 1 : 0);
        if (code === 0 || code === 15) continue;
        const M = maps[l];
        const T = (): Pt => [x0 + st * (L - a) / (b - a), y0], R = (): Pt => [x0 + st, y0 + st * (L - b) / (c - b)], B = (): Pt => [x0 + st * (L - d) / (c - d), y0 + st], Lf = (): Pt => [x0, y0 + st * (L - a) / (d - a)];
        switch (code) {
          case 1: case 14: add(M, kL, Lf(), kB, B()); break;
          case 2: case 13: add(M, kB, B(), kR, R()); break;
          case 3: case 12: add(M, kL, Lf(), kR, R()); break;
          case 4: case 11: add(M, kT, T(), kR, R()); break;
          case 6: case 9: add(M, kT, T(), kB, B()); break;
          case 7: case 8: add(M, kT, T(), kL, Lf()); break;
          case 5: if ((a + b + c + d) / 4 > L) { add(M, kT, T(), kL, Lf()); add(M, kR, R(), kB, B()); } else { add(M, kT, T(), kR, R()); add(M, kL, Lf(), kB, B()); } break;
          case 10: if ((a + b + c + d) / 4 > L) { add(M, kT, T(), kR, R()); add(M, kL, Lf(), kB, B()); } else { add(M, kT, T(), kL, Lf()); add(M, kR, R(), kB, B()); } break;
        }
      }
    }
    if (j % 8 === 7) yield;
  }
  const levels: Level[] = [];
  for (let l = 1; l <= NL; l++) {
    const M = maps[l], seen = new Set<number>(), polys: Poly[] = [];
    const walk = (s0: number) => {
      const ks = [s0];
      seen.add(s0);
      let prev = -1, cur = s0;
      for (;;) {
        const nb = M.get(cur)!.n;
        let nk = -1;
        for (const q of nb) if (q !== prev && !seen.has(q)) { nk = q; break; }
        if (nk < 0) break;
        seen.add(nk); ks.push(nk); prev = cur; cur = nk;
      }
      const closed = ks.length > 2 && M.get(cur)!.n.includes(s0);
      let pts = ks.map(q => M.get(q)!.p), x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const p of pts) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
      if (x1 - x0 + y1 - y0 < 34) return;
      pts = rdp(pts, 1.2, closed);
      if (pts.length < (closed ? 4 : 2)) return;
      polys.push({ pts, closed, bb: [x0, y0, x1, y1], d: closed ? crC(pts) : crO(pts) });
    };
    for (const [q, v] of M) if (v.n.length === 1 && !seen.has(q)) walk(q);
    for (const q of M.keys()) if (!seen.has(q)) walk(q);
    levels.push({ L: l * LV, index: l % 5 === 0, polys, d: polys.map(p => p.d).join('') });
    yield;
  }
  const grid = { H, nx, ny };
  let sd = 7, stp = '', cnt = 0;
  const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 9000 && cnt < 1300; i++) {
    const x = -330 + rnd() * 1480, y = 690 + rnd() * 800;
    if (y < 770 + 60 * n2(x / 220, 4.4)) continue;
    if (Math.hypot(x - C.HQ[0], y - C.HQ[1]) < 250 || hAt(grid, x, y) > 0.22 || pdist(x, y, C.RIVER).d < 24) continue;
    if (n2(x / 120 + 8.8, y / 120 - 2.2) + rnd() * 0.9 < 0.3) continue;
    const r = 1.5 + rnd() * 1.3;
    cnt++;
    stp += 'M' + (x - r).toFixed(1) + ' ' + y.toFixed(1) + 'a' + r.toFixed(2) + ' ' + r.toFixed(2) + ' 0 1 0 ' + (2 * r).toFixed(2) + ' 0a' + r.toFixed(2) + ' ' + r.toFixed(2) + ' 0 1 0 ' + (-2 * r).toFixed(2) + ' 0';
  }
  yield;
  const cand: [number, number, number][] = [];
  for (let j = 4; j < ny - 4; j += 2) for (let i = 4; i < nx - 4; i += 2) {
    const v = H[j * nx + i], x = C.X0 + i * st, y = C.Y0 + j * st;
    if (v < 0.55 || x < -50 || x > 950 || y < -120 || y > 470) continue;
    let mx = true;
    for (let dj = -4; dj <= 4 && mx; dj++) for (let di = -4; di <= 4; di++) if (H[(j + dj) * nx + i + di] > v) { mx = false; break; }
    if (mx) cand.push([x, y, v]);
  }
  cand.sort((a, b) => b[2] - a[2]);
  const peaks: [number, number, number][] = [];
  for (const c of cand) { if (peaks.every(p => Math.hypot(p[0] - c[0], p[1] - c[1]) > 170)) peaks.push(c); if (peaks.length === 3) break; }
  const s2 = Math.round(C.PS / st), pnx = Math.floor((nx - 1) / s2) + 1, pny = Math.floor((ny - 1) / s2) + 1, PH = new Float32Array(pnx * pny), PR = new Float32Array(pnx * pny);
  for (let j = 0; j < pny; j++) for (let i = 0; i < pnx; i++) {
    PH[j * pnx + i] = H[(j * s2) * nx + i * s2];
    PR[j * pnx + i] = 1 + 0.35 * (n2((C.X0 + i * C.PS) / 70 + 40.2, (C.Y0 + j * C.PS) / 70 - 13.7) * 0.5 + 0.5);
  }
  return { H, nx, ny, levels, stipple: stp, river: crO(C.RIVER), peaks, PH, PR, pnx, pny };
}

/** Runs a step generator to completion in one go (tests, Web Worker). */
export function runSteps<T>(gen: Generator<void, T, void>): T {
  for (;;) { const r = gen.next(); if (r.done) return r.value; }
}

export type Raster = { width: number; height: number; data: Uint8ClampedArray };

/** Hypsometric tint with hillshade, two map units per pixel, with a little film-like dither. */
export function* rasterSteps(g: Geo): Generator<void, Raster, void> {
  const st = C.ST, nx = g.nx, ny = g.ny, H = g.H, HY = RELIEF.HY;
  const SH = new Float32Array(nx * ny), Z = 230, ln = Math.hypot(0.52, 0.58, 0.63), Lx = -0.52 / ln, Ly = -0.58 / ln, Lz = 0.63 / ln;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const o = j * nx + i, gx = (H[i < nx - 1 ? o + 1 : o] - H[i > 0 ? o - 1 : o]) / (2 * st), gy = (H[j < ny - 1 ? o + nx : o] - H[j > 0 ? o - nx : o]) / (2 * st);
      const nX = -Z * gx, nY = -Z * gy, nl = Math.hypot(nX, nY, 1);
      SH[o] = (nX * Lx + nY * Ly + Lz) / nl - Lz;
    }
    if (j % 20 === 19) yield;
  }
  const sc = 2, W = Math.round((C.X1 - C.X0) / sc), Hh = Math.round((C.Y1 - C.Y0) / sc), D = new Uint8ClampedArray(W * Hh * 4);
  let sd = 99;
  const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  for (let py = 0; py < Hh; py++) {
    const gy = ((py + 0.5) * sc) / st, j = Math.min(ny - 2, Math.floor(gy)), fy = gy - j;
    for (let px = 0; px < W; px++) {
      const gx = ((px + 0.5) * sc) / st, i = Math.min(nx - 2, Math.floor(gx)), fx = gx - i, o = j * nx + i;
      const h = (H[o] * (1 - fx) + H[o + 1] * fx) * (1 - fy) + (H[o + nx] * (1 - fx) + H[o + nx + 1] * fx) * fy;
      const s = (SH[o] * (1 - fx) + SH[o + 1] * fx) * (1 - fy) + (SH[o + nx] * (1 - fx) + SH[o + nx + 1] * fx) * fy;
      let k = 1;
      while (k < HY.length - 1 && HY[k][0] < h) k++;
      const A = HY[k - 1], B = HY[k], t = Math.min(1, Math.max(0, (h - A[0]) / (B[0] - A[0]))), q = (py * W + px) * 4, dn = (rnd() - 0.5) * 2.2;
      for (let c = 0; c < 3; c++) {
        let v = A[1][c] + (B[1][c] - A[1][c]) * t;
        v = s > 0 ? v + (RELIEF.hlc[c] - v) * s * RELIEF.hs : v * (1 + s * RELIEF.ds);
        D[q + c] = v + dn;
      }
      D[q + 3] = 255;
    }
    if (py % 16 === 15) yield;
  }
  return { width: W, height: Hh, data: D };
}

/** Slope-aware A* on the coarse grid: avoids steep slopes, follows valleys and passes; smoothed. */
export function astar(g: Pick<Geo, 'PH' | 'PR' | 'pnx' | 'pny'>, a: Pt, b: Pt): Pt[] {
  const ps = C.PS, nx = g.pnx, ny = g.pny, PH = g.PH, PR = g.PR, N = nx * ny;
  const cl = (v: number, m: number) => v < 0 ? 0 : v > m ? m : v, id = (p: Pt) => cl(Math.round((p[1] - C.Y0) / ps), ny - 1) * nx + cl(Math.round((p[0] - C.X0) / ps), nx - 1);
  const s = id(a), t = id(b), tx = t % nx, ty = (t / nx) | 0;
  const G = new Float64Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), fin = new Uint8Array(N), hq: number[] = [], hf: number[] = [];
  const push = (n: number, f: number) => {
    hq.push(n); hf.push(f);
    let i = hq.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (hf[p] <= hf[i]) break; let x = hq[p]; hq[p] = hq[i]; hq[i] = x; x = hf[p]; hf[p] = hf[i]; hf[i] = x; i = p; }
  };
  const pop = () => {
    const top = hq[0], ln = hq.pop()!, lf = hf.pop()!;
    if (hq.length) {
      hq[0] = ln; hf[0] = lf;
      let i = 0;
      for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < hq.length && hf[l] < hf[m]) m = l; if (r < hq.length && hf[r] < hf[m]) m = r; if (m === i) break; let x = hq[m]; hq[m] = hq[i]; hq[i] = x; x = hf[m]; hf[m] = hf[i]; hf[i] = x; i = m; }
    }
    return top;
  };
  const S0 = 0.0042, E = 0.7, DIR = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142]];
  G[s] = 0;
  push(s, 0);
  while (hq.length) {
    const u = pop();
    if (fin[u]) continue;
    fin[u] = 1;
    if (u === t) break;
    const ux = u % nx, uy = (u / nx) | 0, hu = PH[u];
    for (const [dx, dy, dl] of DIR) {
      const vx = ux + dx, vy = uy + dy;
      if (vx < 0 || vy < 0 || vx >= nx || vy >= ny) continue;
      const v = vy * nx + vx;
      if (fin[v]) continue;
      const len = dl * ps, sl = Math.abs(PH[v] - hu) / len, c = len * (1 + (sl / S0) * (sl / S0) + E * (hu + PH[v]) * 0.5) * (PR[u] + PR[v]) * 0.5, ng = G[u] + c;
      if (ng < G[v]) { G[v] = ng; from[v] = u; push(v, ng + Math.hypot(vx - tx, vy - ty) * ps); }
    }
  }
  const path: Pt[] = [];
  for (let n = t; n >= 0; n = from[n]) { path.push([C.X0 + (n % nx) * ps, C.Y0 + ((n / nx) | 0) * ps]); if (n === s) break; }
  path.reverse();
  let pts: Pt[] = [a, ...path.slice(1, -1), b];
  for (let it = 0; it < 4; it++) {
    const q = pts.slice();
    for (let i = 1; i < pts.length - 1; i++) q[i] = [(pts[i - 1][0] + 2 * pts[i][0] + pts[i + 1][0]) / 4, (pts[i - 1][1] + 2 * pts[i][1] + pts[i + 1][1]) / 4];
    pts = q;
  }
  return pts;
}

export type RegionCands = [string, [number, number, number, number?][]][];

/** Candidate anchor points (x, y, angle, cost) for the three region names. */
export function regionCands(g: Pick<Geo, 'H' | 'nx' | 'ny'>): RegionCands {
  const d2 = (a: number[], b: number[]) => (a[0] - b[0]) * (a[0] - b[0]) + (a[1] - b[1]) * (a[1] - b[1]);
  const mt: [number, number, number][] = [];
  for (let x = -100; x <= 900; x += 45) for (let y = 0; y <= 470; y += 30) { if (hAt(g, x, y) < 0.28 || pdist(x, y, C.VAL).d < 90) continue; mt.push([x, y, -4]); }
  mt.sort((a, b) => d2(a, [380, 300]) - d2(b, [380, 300]));
  const pl: [number, number, number][] = [];
  for (let x = 0; x <= 800; x += 45) for (let y = 800; y <= 1320; y += 30) pl.push([x, y, 0]);
  pl.sort((a, b) => d2(a, [400, 1000]) - d2(b, [400, 1000]));
  const va: [number, number, number, number][] = [], V = C.VAL;
  for (let s = 40; s <= 720; s += 25) {
    let acc = 0, p: Pt | null = null, tg: Pt | null = null;
    for (let i = 0; i < V.length - 1; i++) {
      const dx = V[i + 1][0] - V[i][0], dy = V[i + 1][1] - V[i][1], L = Math.hypot(dx, dy);
      if (acc + L >= s) { const t = (s - acc) / L; p = [V[i][0] + dx * t, V[i][1] + dy * t]; tg = [dx / L, dy / L]; break; }
      acc += L;
    }
    if (!p || !tg) continue;
    let ang = Math.atan2(tg[1], tg[0]) * 180 / Math.PI;
    if (ang > 90) ang -= 180;
    if (ang < -90) ang += 180;
    for (const o of [60, -60, 90, -90, 35, -35, 120, -120, 140, -140, 160, -160, 180, -180]) va.push([p[0] - tg[1] * o, p[1] + tg[0] * o, Math.round(ang), Math.abs(s - 250) + Math.abs(o) * 0.6]);
    if (s <= 200) for (const o of [70, -70, 110, -110]) va.push([p[0] - tg[1] * o, p[1] + tg[0] * o, 0, 60 + Math.abs(s - 120) + Math.abs(o) * 0.6]);
  }
  va.sort((a, b) => a[3] - b[3]);
  return [['KULVAR DAĞLARI', mt.slice(0, 140)], ['DERS OVASI', pl.slice(0, 140)], ['BAŞVURU GEÇİDİ', va.slice(0, 300)]];
}

// Completion effect: a contour ripple spreading from the camp that was just taken.
export type WaveSource = { c: Pt; delay: number; dur: number; maxR: number; A: number; sig: number; lam: number };
export type Wave = { c: Pt; R: number; A: number; sig: number; lam: number; u: number };

export function waveSources(c: Pt, final: boolean): WaveSource[] {
  const src: WaveSource[] = [{ c, delay: 0, dur: 1150, maxR: 230, A: 9, sig: 18, lam: 34 }];
  if (final) src.push({ c, delay: 480, dur: 2000, maxR: 560, A: 8, sig: 26, lam: 52 });
  return src;
}

export function activeWaves(src: WaveSource[], t: number): Wave[] {
  const act: Wave[] = [];
  for (const s of src) {
    const u = (t - s.delay) / s.dur;
    if (u <= 0 || u >= 1) continue;
    act.push({ c: s.c, R: s.maxR * (1 - (1 - u) * (1 - u)), A: s.A * Math.pow(1 - u, 1.6), sig: s.sig, lam: s.lam, u });
  }
  return act;
}

/** Contour paths displaced by the active waves; `null` where a level is untouched. */
export function rippled(levels: Level[], act: Wave[]): (string | null)[] {
  if (!act.length) return levels.map(() => null);
  const TAU = Math.PI * 2;
  return levels.map(l => {
    let changed = false;
    const ds: string[] = [];
    for (const pl of l.polys) {
      let hit = false;
      for (const s of act) {
        const [x0, y0, x1, y1] = pl.bb, o = s.R + 3 * s.sig, ii = s.R - 3 * s.sig;
        const ex = Math.max(x0 - s.c[0], 0, s.c[0] - x1), ey = Math.max(y0 - s.c[1], 0, s.c[1] - y1);
        if (ex * ex + ey * ey > o * o) continue;
        const fx2 = Math.max(Math.abs(x0 - s.c[0]), Math.abs(x1 - s.c[0])), fy2 = Math.max(Math.abs(y0 - s.c[1]), Math.abs(y1 - s.c[1]));
        if (ii > 0 && fx2 * fx2 + fy2 * fy2 < ii * ii) continue;
        hit = true;
        break;
      }
      if (!hit) { ds.push(pl.d); continue; }
      const pts = dens(pl.pts, pl.closed, 7).map(([x, y]): Pt => {
        let ox = 0, oy = 0;
        for (const s of act) {
          const dx = x - s.c[0], dy = y - s.c[1], r = Math.hypot(dx, dy), u = r - s.R;
          if (r < 0.01 || Math.abs(u) > 3 * s.sig) continue;
          const w = s.A * Math.exp(-u * u / (2 * s.sig * s.sig)) * Math.sin(u * TAU / s.lam) * Math.min(1, r / 10);
          ox += dx / r * w;
          oy += dy / r * w;
        }
        return [x + ox, y + oy];
      });
      ds.push(pl.closed ? crC(pts) : crO(pts));
      changed = true;
    }
    return changed ? ds.join('') : null;
  });
}

'use client';
// Expedition map (Grafit Gece): the terrain, today's route as a path, camps coloured by urgency, passed
// camps with a gold flag and seal line. Used small in Karargâh ('home') and full screen in Harita
// ('atlas'). Behaviour follows the logic class of design-reference/project/Berthier Harita v7.dc.html.
import {memo, useEffect, useEffectEvent, useId, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent} from 'react';
import {ArrowLeft, ArrowRight, Flag, Minus, Plus, Scan, X} from 'lucide-react';
import {keepPassed, nextMove, type Order, type State} from '@/lib/domain';
import {calendarDay} from '@/lib/calendar';
import {C, activeWaves, astar, rippled, waveSources, type Box, type Pt, type WaveSource} from '@/lib/expedition/terrain';
import {KRITIK, REGIONS, YAKLASAN, clockText, daysTag, nextDated, placeCamps, urgency, whenText, type Urgency} from '@/lib/expedition/camps';
import {NO_TEXT, genelArc, genelFlat, placeLabels, regionLabels, type Mark} from '@/lib/expedition/labels';
import {loadTerrain, type MapTerrain} from '@/lib/expedition/load';

type View = {k: number; x: number; y: number};
type Drag = {id: string; x: number; y: number; over: string | null};
type Effect = {pop: string; src: WaveSource[]; seals: Set<string>; t: number};
type Gesture = {
  ptr: Map<number, Pt>; mode: 'pending' | 'pan' | 'scroll' | 'pinch' | 'drag' | null; suppress: boolean;
  start: Pt; v0: View; stop: string | null; type: string; pid: number;
  hold?: ReturnType<typeof setTimeout>; p0?: {dist: number; mid: Pt; v: View};
};

export type ExpeditionMapProps = {
  variant: 'home' | 'atlas';
  state: State;
  order: Order;
  /** home: the camp shown in the order sheet */
  focus?: string | null;
  onFocus?: (frontId: string) => void;
  /** atlas: “Cepheyi aç” */
  onOpen?: (frontId: string) => void;
  onBack?: () => void;
  onList?: () => void;
  /** Saves a new order of today's fronts with the existing reorder command. */
  reorder: (ids: string[]) => Promise<boolean | undefined>;
  editable: boolean;
  /** Where the map's notices go (the app's single status card); without it they show inside the map. */
  notify?: (text: string) => void;
};

const HQ = '__hq';
const SIZE = {home: {w: 390, h: 360}, atlas: {w: 390, h: 768}};
const PAD = {home: {t: 40, r: 64, b: 46, l: 50}, atlas: {t: 150, r: 30, b: 232, l: 44}};
// Narrower than the design, the home route would run under the zoom group (12 + 44 px from the edge, camps up
// to 22 px wide), so it keeps clear of it there. The atlas already starts below the group.
const padFor = (variant: 'home' | 'atlas', w: number) => variant === 'home' && w < SIZE.home.w ? {...PAD.home, r: 84} : PAD[variant];
const pad2 = (n: number) => String(n).padStart(2, '0');
const later = (fn: () => void) => {
  const idle = (window as Window & {requestIdleCallback?: (cb: () => void, o?: {timeout: number}) => number}).requestIdleCallback;
  if (idle) idle(fn, {timeout: 120}); else setTimeout(fn, 16);
};
const onClient = () => () => {};
// One media query and one font promise per session: creating or reading them again on every map costs a
// synchronous style pass.
let motionQuery: MediaQueryList | null = null;
const motion = () => motionQuery ??= window.matchMedia('(prefers-reduced-motion: reduce)');
const watchMotion = (cb: () => void) => { const m = motion(); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb); };
let fontsReady: Promise<unknown> | null = null, fontsDone = false;

// Text widths for label placement; measured once per text and font, cleared when the web fonts arrive.
const widths = new Map<string, number>();
let measurer: CanvasRenderingContext2D | null = null;
function tw(text: string, font: string) {
  const key = font + '|' + text;
  let w = widths.get(key);
  if (w === undefined) {
    measurer ??= document.createElement('canvas').getContext('2d');
    if (!measurer) return text.length * 7;
    measurer.font = font;
    w = measurer.measureText(text).width;
    widths.set(key, w);
  }
  return w;
}

// Route legs follow the terrain. Each pair of camps is solved once per session and reused both ways.
const legs = new Map<string, Pt[]>();
const legKey = (a: Pt, b: Pt) => a.join(',') + '>' + b.join(',');
function knownLeg(a: Pt, b: Pt): Pt[] | undefined {
  const hit = legs.get(legKey(a, b));
  if (hit) return hit;
  const back = legs.get(legKey(b, a));
  if (back) { const leg = back.slice().reverse(); legs.set(legKey(a, b), leg); return leg; }
}

function sealed(route: string[], done: Set<string>) {
  const nodes = [HQ, ...route], out = new Set<string>(), held = (id: string) => id === HQ || done.has(id);
  for (let i = 1; i < nodes.length; i++) if (held(nodes[i - 1]) && held(nodes[i])) out.add(nodes[i - 1] + '>' + nodes[i]);
  return out;
}

function look(u: Urgency) {
  switch (u) {
    case 'done': return {bg: 'var(--map-ground)', border: '1.5px solid var(--gold)', fg: 'var(--gold)', sh: ['var(--map-flag-shadow)']};
    case 'crit': return {bg: 'var(--hot)', border: '1px solid var(--hot)', fg: 'var(--map-ground)', sh: ['0 0 0 5px var(--hot-soft)', '0 0 22px 4px var(--hot-glow)']};
    case 'near': return {bg: 'var(--map-camp)', border: '1.5px solid var(--hot)', fg: 'var(--hot-ink)', sh: ['0 0 0 4px var(--hot-soft)', '0 0 14px 2px var(--hot-glow-soft)']};
    default: return {bg: 'var(--map-camp)', border: '1px solid var(--map-camp-border)', fg: 'var(--map-ink)', sh: [] as string[]};
  }
}

function Sonar({size, still}: {size: number; still: boolean}) {
  const s: CSSProperties = {width: size, height: size, marginLeft: -size / 2, marginTop: -size / 2};
  if (still) return <span className="xm-sonar is-still" style={s}/>;
  return <span className="xm-sonar-wrap"><span className="xm-sonar" style={s}/><span className="xm-sonar is-late" style={s}/></span>;
}

/**
 * Static terrain in map units; only the contours change, during the completion ripple. The path data is
 * large, so it is mounted over a few frames (`shown` layers) instead of in one long task.
 */
const Terrain = memo(function Terrain({terrain, ripple, shown}: {terrain: MapTerrain; ripple: (string | null)[] | null; shown: number}) {
  return <>
    {terrain.image && <image href={terrain.image} x={C.X0} y={C.Y0} width={C.X1 - C.X0} height={C.Y1 - C.Y0} preserveAspectRatio="none"/>}
    {shown > 0 && <path d={terrain.stipple} className="xm-stipple"/>}
    {terrain.levels.slice(0, Math.max(0, shown - 1)).map((l, i) => <path key={i} d={ripple?.[i] ?? l.d} className={l.index ? 'xm-contour is-index' : 'xm-contour'}/>)}
    {shown > 0 && <path d={terrain.river} className="xm-river"/>}
  </>;
});

export default function ExpeditionMap({variant, state, order, focus, onFocus, onOpen, onBack, onList, reorder, editable, notify}: ExpeditionMapProps) {
  const atlas = variant === 'atlas', fronts = state.fronts, box = useRef<HTMLDivElement>(null);
  const arcId = 'xm-arc-' + useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const mounted = useSyncExternalStore(onClient, () => true, () => false);
  const reduced = useSyncExternalStore(watchMotion, () => motion().matches, () => false);
  const [size, setSize] = useState(SIZE[variant]), [terrain, setTerrain] = useState<MapTerrain | null>(null), [shown, setShown] = useState(0), [, setFrame] = useState(0);
  const [view, setViewState] = useState<View | null>(null), [drag, setDragState] = useState<Drag | null>(null);
  const [pending, setPending] = useState<{key: string; ids: string[]} | null>(null), [saving, setSaving] = useState(false);
  const [sel, setSel] = useState<string | null>(null), [legend, setLegend] = useState(false), [toast, setToast] = useState(''), [effect, setEffect] = useState<Effect | null>(null);
  const liveView = useRef<View | null>(null), dragRef = useRef<Drag | null>(null), gesture = useRef<Gesture | null>(null), prevDone = useRef<Set<string> | null>(null);
  const raf = useRef(0), anim = useRef(0), fxRaf = useRef(0), toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const pos = useMemo(() => placeCamps(Object.values(fronts)), [fronts]);
  const slots = order.slots.filter(s => pos[s.frontId]);
  const done: Record<string, string> = {};
  for (const s of slots) if (s.doneAt) done[s.frontId] = clockText(s.doneAt);
  const slotKey = slots.map(s => s.frontId).sort().join(), doneKey = slots.filter(s => s.doneAt).map(s => s.frontId).sort().join();
  const base = pending && pending.key === slotKey ? pending.ids : slots.map(s => s.frontId);
  const moved = (list: string[], id: string, over: string) => {
    const a = [...list], from = a.indexOf(id), to = a.indexOf(over);
    if (from < 0 || to < 0) return a;
    a.splice(from, 1);
    a.splice(to, 0, id);
    return keepPassed({...order, slots}, a);
  };
  const route = drag?.over ? moved(base, drag.id, drag.over) : base, routeKey = route.join(',');
  const firstUndone = route.find(id => !done[id]);
  const focusId = atlas ? sel : focus && route.includes(focus) ? focus : firstUndone ?? route[0] ?? null;

  const fitIds = atlas ? Object.values(fronts).filter(f => f.status !== 'closed').map(f => f.id) : route;
  const fit: View = (() => {
    const pts = fitIds.map(id => pos[id]).filter(Boolean).concat([C.HQ]);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    const {w, h} = size, pad = padFor(variant, w), k = Math.min((w - pad.l - pad.r) / Math.max(1, x1 - x0), (h - pad.t - pad.b) / Math.max(1, y1 - y0));
    return {k, x: pad.l + ((w - pad.l - pad.r) - (x1 - x0) * k) / 2 - x0 * k, y: pad.t + ((h - pad.t - pad.b) - (y1 - y0) * k) / 2 - y0 * k};
  })();
  const clampK = (k: number) => Math.min(fit.k * 5, Math.max(fit.k * 0.55, k));
  // Gestures write the view every frame; React state catches up once per animation frame.
  const currentView = () => liveView.current ?? view ?? fit;
  const setView = (next: View | null) => {
    liveView.current = next;
    if (!raf.current) raf.current = requestAnimationFrame(() => { raf.current = 0; setViewState(liveView.current); });
  };
  const animate = (to: View, follow = false) => {
    cancelAnimationFrame(anim.current);
    if (reduced) { setView(follow ? null : to); return; }
    const from = currentView();
    let t0 = -1;
    const step = (now: number) => {
      if (t0 < 0) t0 = now;
      const t = Math.min(1, (now - t0) / 300), e = 1 - Math.pow(1 - t, 3);
      setView(t >= 1 && follow ? null : {k: from.k + (to.k - from.k) * e, x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e});
      if (t < 1) anim.current = requestAnimationFrame(step);
    };
    anim.current = requestAnimationFrame(step);
  };
  const zoomBy = (f: number) => {
    const cur = currentView(), k = clampK(cur.k * f), cx = size.w / 2, cy = size.h / 2, wx = (cx - cur.x) / cur.k, wy = (cy - cur.y) / cur.k;
    animate({k, x: cx - wx * k, y: cy - wy * k});
  };
  const flash = (text: string) => {
    if (notify) { notify(text); return; }
    clearTimeout(toastTimer.current);
    setToast(text);
    toastTimer.current = setTimeout(() => setToast(''), 2800);
  };
  const setDrag = (d: Drag | null) => { dragRef.current = d; setDragState(d); };

  // Wheel: the atlas zooms freely; on Karargâh only with Ctrl/⌘, so the page keeps scrolling.
  const onWheel = useEffectEvent((e: WheelEvent, el: HTMLElement) => {
    if (!atlas && !e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const cur = currentView(), r = el.getBoundingClientRect(), s = (r.width / el.offsetWidth) || 1;
    const p: Pt = [(e.clientX - r.left) / s, (e.clientY - r.top) / s], k = clampK(cur.k * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0016))), wx = (p[0] - cur.x) / cur.k, wy = (p[1] - cur.y) / cur.k;
    setView({k, x: p[0] - wx * k, y: p[1] - wy * k});
  });

  // A newly passed camp: in-map notice, then (motion permitting) pop, contour ripple and seal drawing.
  const onDone = useEffectEvent((now: Set<string>) => {
    const before = prevDone.current;
    prevDone.current = now;
    if (!before) return;
    const fresh = route.filter(id => now.has(id) && !before.has(id)), stale = effect && !now.has(effect.pop);
    if (!fresh.length && !stale) return;
    cancelAnimationFrame(fxRaf.current);
    if (!fresh.length) { fxRaf.current = requestAnimationFrame(() => setEffect(null)); return; }
    const id = fresh[fresh.length - 1], final = route.length > 0 && route.every(x => now.has(x)), old = sealed(route, before);
    const seals = new Set([...sealed(route, now)].filter(x => !old.has(x))), src = waveSources(pos[id], final), total = final ? 2520 : 1200;
    let t0 = -1;
    const run = (ts: number) => {
      if (t0 < 0) {
        t0 = ts;
        flash(final ? 'Günün bütün hamleleri bitti. Sefer tamamlandı.' : 'Hamle tamamlandı. Kampa bayrak dikildi.');
        if (reduced) { setEffect(null); return; }
      }
      const t = ts - t0;
      if (t >= total) { setEffect(null); return; }
      setEffect({pop: id, src, seals, t});
      fxRaf.current = requestAnimationFrame(run);
    };
    fxRaf.current = requestAnimationFrame(run);
  });

  useEffect(() => {
    let live = true;
    // Label sizes are measured with the web fonts; measure again whenever a font finishes loading.
    const remeasure = () => { if (live) { widths.clear(); setFrame(n => n + 1); } };
    if (!fontsDone) {
      const wait = () => { fontsReady ??= (document.fonts?.ready ?? Promise.resolve()).then(() => { fontsDone = true; widths.clear(); }); fontsReady.then(remeasure); };
      if (fontsReady) wait(); else later(wait);
    }
    document.fonts?.addEventListener('loadingdone', remeasure);
    loadTerrain().then(t => { if (live) setTerrain(t); }, () => {});
    return () => {
      live = false;
      document.fonts?.removeEventListener('loadingdone', remeasure);
      cancelAnimationFrame(raf.current); cancelAnimationFrame(anim.current); cancelAnimationFrame(fxRaf.current);
      clearTimeout(toastTimer.current);
    };
  }, []);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => { if (el.clientWidth && el.clientHeight) setSize(s => s.w === el.clientWidth && s.h === el.clientHeight ? s : {w: el.clientWidth, h: el.clientHeight}); });
    ro.observe(el);
    const wheel = (e: WheelEvent) => onWheel(e, el);
    el.addEventListener('wheel', wheel, {passive: false});
    return () => { ro.disconnect(); el.removeEventListener('wheel', wheel); };
  }, [mounted]);

  // Legs are solved a few at a time once the terrain is there; until then they are drawn straight.
  useEffect(() => {
    if (!terrain) return;
    const at = (id: string) => id === HQ ? C.HQ : pos[id], nodes = [HQ, ...routeKey.split(',').filter(Boolean)], todo: [Pt, Pt][] = [];
    for (let i = 1; i < nodes.length; i++) { const a = at(nodes[i - 1]), b = at(nodes[i]); if (a && b && !knownLeg(a, b)) todo.push([a, b]); }
    if (!todo.length) return;
    let live = true;
    const run = () => {
      if (!live) return;
      const end = performance.now() + 8;
      while (todo.length && performance.now() < end) { const [a, b] = todo.shift()!; if (!knownLeg(a, b)) legs.set(legKey(a, b), astar(terrain, a, b)); }
      setFrame(n => n + 1);
      if (todo.length) later(run);
    };
    later(run);
    return () => { live = false; };
  }, [terrain, routeKey, pos]);

  // Terrain layers arrive a few per frame (stipple and river first, then the contours).
  useEffect(() => {
    if (!terrain) return;
    const total = terrain.levels.length + 1;
    let n = 0, id = 0;
    const step = () => { n = Math.min(total, n + 5); setShown(n); if (n < total) id = requestAnimationFrame(step); };
    id = requestAnimationFrame(step);
    return () => cancelAnimationFrame(id);
  }, [terrain]);

  useEffect(() => { onDone(new Set(doneKey ? doneKey.split(',') : [])); }, [doneKey]);

  if (!mounted) return <div ref={box} className={`expedition-map is-${variant}`} aria-hidden="true"/>;

  // ---- Screen layout (port of mapVals) ----
  const v = view ?? fit, {w, h} = size, k = v.k, S = (p: Pt): Pt => [p[0] * k + v.x, p[1] * k + v.y];
  const today = calendarDay(), daysOf = new Map<string, number | null>();
  const days = (id: string) => { if (!daysOf.has(id)) daysOf.set(id, nextDated(state, id, today)?.days ?? null); return daysOf.get(id)!; };
  const at = (id: string): Pt => id === HQ ? C.HQ : pos[id];
  const legOf = (a: string, b: string): Pt[] => (terrain && knownLeg(at(a), at(b))) || [at(a), at(b)];
  const fx = effect ? {...effect, act: activeWaves(effect.src, effect.t)} : null;
  const toD = (pts: Pt[]) => { let d = ''; for (let j = 0; j < pts.length; j++) { const s = S(pts[j]); d += (j ? 'L' : 'M') + s[0].toFixed(1) + ' ' + s[1].toFixed(1); } return d; };
  const nodes = [HQ, ...route], legPaths: {d: string; next: boolean}[] = [], sealPaths: string[] = [];
  for (let i = 1; i < nodes.length; i++) {
    const a = nodes[i - 1], b = nodes[i], wp = legOf(a, b), key = a + '>' + b, held = (id: string) => id === HQ || !!done[id];
    if (held(a) && held(b)) {
      if (!fx?.seals.has(key)) { sealPaths.push(toD(wp)); continue; }
      const p = Math.min(1, Math.max(0, fx.t / 720)), e = p < 0.5 ? 2 * p * p : 1 - Math.pow(2 - 2 * p, 2) / 2;
      if (e < 1) legPaths.push({d: toD(wp), next: true});
      if (e > 0) {
        const x = e * (wp.length - 1), n = Math.floor(x), part = wp.slice(0, n + 1);
        if (n < wp.length - 1) { const p0 = wp[n], p1 = wp[n + 1], q = x - n; part.push([p0[0] + (p1[0] - p0[0]) * q, p0[1] + (p1[1] - p0[1]) * q]); }
        sealPaths.push(toD(part));
      }
      continue;
    }
    legPaths.push({d: toD(wp), next: b === firstUndone});
  }
  const captured = route.length > 0 && route.every(id => done[id]);
  const hq = S(C.HQ), marks: Mark[] = [{x: hq[0], y: hq[1] + 10, r: 30}], scr: {id: string; x: number; y: number; done: boolean}[] = [];
  const stops = route.map((id, i) => {
    const fr = fronts[id], p = S(pos[id]), isDone = !!done[id], isFocus = id === focusId, isNext = id === firstUndone, d = days(id), u = urgency(fr, d, isDone), tag = isDone ? 'GEÇİLDİ · ' + done[id] : daysTag(fr, d);
    const tagW = tw(tag, "400 10.5px 'IBM Plex Mono'") * 1.07;
    const m: Mark = {id, x: p[0], y: p[1], r: 22, w: Math.max(tw(fr.title, "500 13px 'DM Sans'"), tagW) + 19, h: 39, prio: isFocus ? 100 : isNext ? 93 : isDone ? 92 - i * 0.1 : u === 'crit' ? 90 - i * 0.1 : 60 - i, force: isFocus || isDone, alt: isDone ? [tagW + 19, 22] : null};
    marks.push(m);
    scr.push({id, x: p[0], y: p[1], done: isDone});
    return {m, id, title: fr.title, i, isDone, isFocus, isNext, tag, u};
  });
  const others = atlas ? Object.values(fronts).filter(fr => fr.status !== 'closed' && !route.includes(fr.id)).map(fr => {
    const p = S(pos[fr.id]), d = days(fr.id), u = urgency(fr, d, false), hasTag = u === 'crit' || u === 'near', tag = daysTag(fr, d), isSel = sel === fr.id;
    const m: Mark = {id: fr.id, x: p[0], y: p[1], r: 12, w: Math.max(tw(fr.title, "500 12px 'DM Sans'"), hasTag ? tw(tag, "400 10px 'IBM Plex Mono'") * 1.07 : 0) + 16, h: hasTag ? 36 : 23, prio: isSel ? 100 : u === 'crit' ? 70 : hasTag ? 40 : 20, force: isSel};
    marks.push(m);
    return {m, fr, tag, isSel, u, hasTag};
  }) : [];
  const card = atlas && sel && fronts[sel] ? (() => {
    const fr = fronts[sel], ri = route.indexOf(sel), dated = nextDated(state, sel, today), d = dated?.days ?? null, u = urgency(fr, d, !!done[sel]), slot = slots.find(s => s.frontId === sel);
    return {
      fr, type: REGIONS[fr.type].label + ' · ' + REGIONS[fr.type].region, hot: u === 'crit' || u === 'near',
      move: slot && !slot.doneAt ? slot.text : nextMove(fr)?.text,
      meta: dated ? dated.event.title + ' · ' + whenText(dated.event) : fr.where ? 'Kaldığın yer: ' + fr.where : 'Tarihli kalemi yok.',
      days: fr.status === 'held' ? 'BEKLETİLİYOR' : d == null ? 'TARİHSİZ' : d === 0 ? 'BUGÜN' : d === 1 ? 'YARIN' : d + ' GÜN KALDI',
      route: ri >= 0 ? 'ROTADA ' + pad2(ri + 1) + (done[sel] ? ' · GEÇİLDİ' : '') : 'BUGÜNÜN ROTASINDA DEĞİL',
    };
  })() : null;
  const legendOpen = atlas && legend && !card, showPending = !!pending && pending.key === slotKey, listChip = atlas && !card && !showPending && !!onList;
  const extra: Box[] = atlas
    ? [[0, 0, w, 128], [w - 60, 0, w, 170], [0, h - 180, w, h], legendOpen ? [w - 276, h - 452, w - 8, h - 182] : [w - 150, h - 234, w - 8, h - 182], ...(listChip ? [[8, h - 234, 104, h - 182] as Box] : [])]
    : [[w - 60, 0, w, 150]];
  const top = atlas ? 132 : 6, bot = atlas ? h - 184 : h - 6;
  const grid = new Map<string, number[]>(), cell = 16;
  const addPt = (x: number, y: number) => { if (x < -20 || y < -20 || x > w + 20 || y > h + 20) return; const key = Math.floor(x / cell) + ',' + Math.floor(y / cell); let a = grid.get(key); if (!a) grid.set(key, a = []); a.push(x, y); };
  for (let i = 1; i < nodes.length; i++) {
    let pv: Pt | null = null;
    for (const q of legOf(nodes[i - 1], nodes[i])) {
      const s = S(q);
      if (pv) { const n = Math.ceil(Math.hypot(s[0] - pv[0], s[1] - pv[1]) / 7); for (let j = 1; j < n; j++) addPt(pv[0] + (s[0] - pv[0]) * j / n, pv[1] + (s[1] - pv[1]) * j / n); }
      addPt(s[0], s[1]);
      pv = s;
    }
  }
  const legHit = (b: Box) => {
    for (let cx = Math.floor((b[0] - 4) / cell); cx <= Math.floor((b[2] + 4) / cell); cx++) for (let cy = Math.floor((b[1] - 4) / cell); cy <= Math.floor((b[3] + 4) / cell); cy++) {
      const a = grid.get(cx + ',' + cy);
      if (a) for (let i = 0; i < a.length; i += 2) if (a[i] > b[0] - 4 && a[i] < b[2] + 4 && a[i + 1] > b[1] - 4 && a[i + 1] < b[3] + 4) return true;
    }
    return false;
  };
  const {api: PL, between: words} = placeLabels(marks, w, h, extra, api => {
    if (!terrain) return null;
    const free = () => false;
    let regions = regionLabels(api, S, size, top, bot, legHit, null, terrain.cands, tw), arc = genelArc(api, S, k, size, top, bot, legHit, tw);
    regions = regionLabels(api, S, size, top, bot, free, regions, terrain.cands, tw);
    if (!arc.on) arc = genelArc(api, S, k, size, top, bot, free, tw);
    return {regions, arc, flat: arc.on ? NO_TEXT : genelFlat(api, S, size, top, bot, tw)};
  });
  const regions = words?.regions ?? [NO_TEXT, NO_TEXT, NO_TEXT], arc = words?.arc ?? {arc: 'M0 0', on: false}, flat = words?.flat ?? NO_TEXT;
  const peaks = (terrain?.peaks ?? []).map(p => {
    const s = S([p[0], p[1]]), b: Box = [s[0] - 8, s[1] - 8, s[0] + 8, s[1] + 7];
    if (b[0] < 2 || b[2] > w - 2 || b[1] < top || b[3] > bot || PL.hits(b)) return null;
    PL.placed.push(b);
    return (s[0] - 5.5).toFixed(1) + ',' + (s[1] + 4.5).toFixed(1) + ' ' + (s[0] + 5.5).toFixed(1) + ',' + (s[1] + 4.5).toFixed(1) + ' ' + s[0].toFixed(1) + ',' + (s[1] - 5.5).toFixed(1);
  });
  const rings: {x: number; y: number; r: number; op: number}[] = [];
  if (fx) for (const s of fx.act) {
    const c = S(s.c), o = Math.pow(1 - s.u, 1.5);
    rings.push({x: c[0], y: c[1], r: s.R * k, op: 0.62 * o});
    if (s.R > s.lam) rings.push({x: c[0], y: c[1], r: (s.R - s.lam) * k, op: 0.3 * o});
  }
  const ripple = fx && terrain ? rippled(terrain.levels, fx.act) : null;
  const last = route.length ? S(pos[route[route.length - 1]]) : null;
  const tr = (x: number, y: number) => `translate(${(x - 22).toFixed(1)}px,${(y - 22).toFixed(1)}px)`;
  const plateAt = (lab: Mark['lab']): CSSProperties => ({left: lab ? 22 + lab[0] : 0, top: lab ? 22 + lab[1] : 0});
  const dn = drag ? route.indexOf(drag.id) + 1 : 0, open = Object.values(fronts).filter(fr => fr.status !== 'closed').length;

  // ---- Gestures (port of pDown / pMove / pUp / pClick / lift / dragTo / drop) ----
  const canDrag = (id: string) => editable && !saving && !done[id] && base.includes(id);
  const loc = (e: {clientX: number; clientY: number}, el: HTMLElement): Pt => { const r = el.getBoundingClientRect(), s = (r.width / el.offsetWidth) || 1; return [(e.clientX - r.left) / s, (e.clientY - r.top) / s]; };
  const lift = (id: string, p: Pt, el: HTMLElement) => {
    const g = gesture.current!;
    g.mode = 'drag';
    g.suppress = true;
    try { el.setPointerCapture(g.pid); } catch {}
    setDrag({id, x: p[0], y: p[1], over: null});
    try { navigator.vibrate?.(12); } catch {}
  };
  const dragTo = (p: Pt) => {
    const d = dragRef.current;
    if (!d) return;
    let over: string | null = null, best = 38;
    for (const s of scr) { if (s.id === d.id || s.done) continue; const dd = Math.hypot(s.x - p[0], s.y - p[1]); if (dd < best) { best = dd; over = s.id; } }
    setDrag({...d, x: p[0], y: p[1], over});
  };
  const drop = (cancel: boolean) => {
    const d = dragRef.current;
    if (!d) return;
    if (!cancel && d.over) { const next = moved(base, d.id, d.over); if (next.join() !== base.join()) setPending({key: slotKey, ids: next}); }
    setDrag(null);
  };
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = e.currentTarget, p = loc(e, el);
    const g = gesture.current ??= {ptr: new Map(), mode: null, suppress: false, start: p, v0: currentView(), stop: null, type: '', pid: 0} as Gesture;
    g.ptr.set(e.pointerId, p);
    if (g.ptr.size === 2) {
      clearTimeout(g.hold);
      const [a, b] = [...g.ptr.values()];
      g.mode = 'pinch';
      g.suppress = true;
      g.p0 = {dist: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], v: {...currentView()}};
      for (const id of g.ptr.keys()) { try { el.setPointerCapture(id); } catch {} }
      if (dragRef.current) setDrag(null);
      return;
    }
    if (g.ptr.size > 2) return;
    const stop = (e.target as Element).closest?.('[data-stop]');
    g.mode = 'pending'; g.suppress = false; g.start = p; g.v0 = {...currentView()};
    g.stop = stop ? stop.getAttribute('data-stop') : null; g.type = e.pointerType; g.pid = e.pointerId;
    if (g.stop && e.pointerType !== 'mouse' && canDrag(g.stop)) { const id = g.stop; g.hold = setTimeout(() => { if (g.mode === 'pending') lift(id, g.start, el); }, 350); }
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || !g.ptr.has(e.pointerId)) return;
    const el = e.currentTarget, p = loc(e, el);
    g.ptr.set(e.pointerId, p);
    if (g.mode === 'pinch' && g.p0) {
      const [a, b] = [...g.ptr.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, m: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], o = g.p0.v, nk = clampK(o.k * d / g.p0.dist), wx = (g.p0.mid[0] - o.x) / o.k, wy = (g.p0.mid[1] - o.y) / o.k;
      setView({k: nk, x: m[0] - wx * nk, y: m[1] - wy * nk});
      return;
    }
    if (g.mode === 'drag') { e.preventDefault(); dragTo(p); return; }
    if (g.mode !== 'pending' && g.mode !== 'pan') return;
    const dx = p[0] - g.start[0], dy = p[1] - g.start[1];
    if (g.mode === 'pending') {
      if (Math.hypot(dx, dy) < 6) return;
      clearTimeout(g.hold);
      g.suppress = true;
      if (g.stop && g.type === 'mouse' && canDrag(g.stop)) { lift(g.stop, p, el); return; }
      if (g.type === 'mouse' || atlas) { g.mode = 'pan'; try { el.setPointerCapture(e.pointerId); } catch {} } else { g.mode = 'scroll'; return; }
    }
    setView({k: g.v0.k, x: g.v0.x + dx, y: g.v0.y + dy});
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>, cancel: boolean) => {
    const g = gesture.current;
    if (!g || !g.ptr.has(e.pointerId)) return;
    clearTimeout(g.hold);
    g.ptr.delete(e.pointerId);
    if (g.mode === 'pinch') {
      if (g.ptr.size === 1) { const [p] = [...g.ptr.values()]; g.mode = 'pan'; g.start = p; g.v0 = {...currentView()}; } else if (!g.ptr.size) g.mode = null;
      return;
    }
    if (g.mode === 'drag') drop(cancel);
    if (!g.ptr.size) g.mode = null;
  };
  const onClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (g?.suppress) { g.suppress = false; return; }
    if ((e.target as Element).closest('[data-stop],[data-front],button')) return;
    if (atlas) setSel(null);
  };
  const tap = (id: string) => {
    const g = gesture.current;
    if (g?.suppress) { g.suppress = false; return; }
    if (atlas) { setSel(id); setLegend(false); } else onFocus?.(id);
  };
  const save = async () => {
    if (!base || !pending) return;
    setSaving(true);
    const ok = await reorder(base);
    setSaving(false);
    if (ok) { setPending(null); flash('Sıra kaydedildi. Kayıt defterinden geri alabilirsin.'); }
  };
  const stopProp = (e: {stopPropagation: () => void}) => e.stopPropagation();

  return <div ref={box} className={`expedition-map is-${variant}`} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={e => onPointerUp(e, false)} onPointerCancel={e => onPointerUp(e, true)} onClick={onClick}>
    <svg className="xm-svg" aria-hidden="true">
      <g transform={`translate(${v.x.toFixed(2)} ${v.y.toFixed(2)}) scale(${k.toFixed(4)})`}>
        <rect x="-8000" y="-8000" width="16000" height="16000" className="xm-ground"/>
        {terrain && <Terrain terrain={terrain} ripple={ripple} shown={shown}/>}
      </g>
      {peaks.map((p, i) => p && <polygon key={i} points={p} className="xm-peak"/>)}
      {rings.map((r, i) => <circle key={i} cx={r.x.toFixed(1)} cy={r.y.toFixed(1)} r={r.r.toFixed(1)} className="xm-ring" style={{opacity: r.op}}/>)}
      {legPaths.map((l, i) => <path key={'c' + i} d={l.d} className="xm-leg-casing"/>)}
      {legPaths.map((l, i) => <path key={'l' + i} d={l.d} className={l.next ? 'xm-leg is-next' : 'xm-leg'}/>)}
      {[1, 2, 3, 4].map(layer => sealPaths.map((d, i) => <path key={layer + '-' + i} d={d} className={'xm-seal is-' + layer}/>))}
      <text transform={regions[0].tf} className="xm-region" display={regions[0].on ? 'inline' : 'none'}>PROJE DAĞLARI</text>
      <text transform={regions[1].tf} className="xm-region" display={regions[1].on ? 'inline' : 'none'}>DERS OVASI</text>
      <text transform={regions[2].tf} className="xm-region is-small" display={regions[2].on ? 'inline' : 'none'}>BAŞVURU GEÇİDİ</text>
      <path id={arcId} d={arc.arc} fill="none" stroke="none"/>
      <text className="xm-region is-small is-arc" display={arc.on ? 'inline' : 'none'}><textPath href={'#' + arcId} startOffset="50%">İŞ DÜZLÜĞÜ</textPath></text>
      <text transform={flat.tf} className="xm-region is-small" display={flat.on ? 'inline' : 'none'}>İŞ DÜZLÜĞÜ</text>
      {captured && last && <g transform={`translate(${last[0].toFixed(1)} ${last[1].toFixed(1)})`}><g className="xm-summit"><circle r="50" style={{opacity: 0.14}}/><circle r="36" style={{opacity: 0.26}}/><circle r="27" style={{opacity: 0.42}}/></g></g>}
    </svg>
    <div className="xm-vignette"/>
    <div className="xm-grain"/>
    <div className="xm-hq" style={{transform: `translate(${hq[0].toFixed(1)}px,${hq[1].toFixed(1)}px)`}}><span className="xm-hq-pin">✳</span><span className="xm-hq-name">KARARGÂH</span></div>
    {others.map(({m, fr, tag, isSel, u, hasTag}) => {
      const held = fr.status === 'held', crit = u === 'crit', near = u === 'near', sh: string[] = [];
      if (isSel) sh.push('0 0 0 3px var(--map-ground)', '0 0 0 4.5px var(--map-ink)');
      if (crit) sh.push('0 0 12px 3px var(--hot-glow)'); else if (near) sh.push('0 0 10px 1px var(--hot-glow-soft)');
      return <button key={fr.id} data-front={fr.id} aria-label={fr.title} className="xm-other" style={{transform: tr(m.x, m.y), opacity: held ? 0.75 : 1}} onClick={() => tap(fr.id)}>
        {crit && <Sonar size={30} still={reduced}/>}
        <span className="xm-other-disc" style={{background: crit ? 'var(--hot)' : 'var(--map-camp)', border: crit || near ? '1.5px solid var(--hot)' : (held ? '1.5px dashed ' : '1.5px solid ') + 'var(--map-other)', boxShadow: sh.length ? sh.join(',') : 'none'}}><span style={{background: crit ? 'var(--map-ground)' : near ? 'var(--hot)' : held ? 'transparent' : 'var(--map-other)'}}/></span>
        {m.lab && <span className="xm-plate is-small" style={{...plateAt(m.lab), borderColor: crit ? 'var(--hot)' : near ? 'var(--hot-border)' : 'transparent', boxShadow: crit ? '0 0 14px var(--hot-glow-soft)' : 'none'}}><span className="xm-plate-title">{fr.title}</span>{hasTag && <span className="xm-plate-tag" style={{color: 'var(--hot-ink)'}}>{tag}</span>}</span>}
      </button>;
    })}
    {stops.map(({m, id, title, i, isDone, isFocus, isNext, tag, u}) => {
      const st = look(u), lifted = drag?.id === id, over = drag?.over === id;
      let sh = st.sh;
      if (isFocus) sh = ['0 0 0 3.5px var(--map-ground)', '0 0 0 6.5px var(--map-ink)', ...sh];
      else if (isNext) sh = ['0 0 0 4px var(--map-ground)', '0 0 0 5.5px var(--map-route)', ...sh];
      if (over) sh = ['0 0 0 3px var(--map-route)', '0 0 0 10px var(--map-route-glow)'];
      const pop = fx && fx.pop === id && fx.t < 560 ? 1 + 0.36 * Math.pow(1 - fx.t / 560, 2) : 1;
      return <button key={id} data-stop={id} aria-label={`${pad2(i + 1)} ${title}${isDone ? ' · geçildi ' + done[id] : ''}`} aria-pressed={atlas ? undefined : isFocus} className="xm-stop" style={{transform: tr(m.x, m.y), opacity: lifted ? 0.3 : 1}} onClick={() => tap(id)}>
        <span className="xm-stop-clear"/><span className="xm-stop-fence"/>
        {u === 'crit' && <Sonar size={38} still={reduced}/>}
        <span className="xm-stop-disc" style={{background: st.bg, border: st.border, color: st.fg, boxShadow: sh.length ? sh.join(',') : 'none', transform: `scale(${(pop * (isFocus ? 1.08 : 1)).toFixed(3)})`}}>{isDone ? <Flag size={16} fill="currentColor"/> : pad2(i + 1)}</span>
        {m.lab && <span className="xm-plate" style={{...plateAt(m.lab), borderColor: u === 'done' ? 'var(--map-seal-border)' : u === 'crit' ? 'var(--hot)' : u === 'near' ? 'var(--hot-border)' : 'transparent', boxShadow: u === 'crit' ? '0 0 16px var(--hot-glow-soft)' : 'none'}}>{!m.compact && <span className="xm-plate-title">{title}</span>}<span className="xm-plate-tag" style={{color: u === 'done' ? 'var(--gold)' : u === 'crit' || u === 'near' ? 'var(--hot-ink)' : 'var(--map-muted)'}}>{tag}</span></span>}
      </button>;
    })}
    {drag && <div className="xm-ghost" style={{transform: tr(drag.x, drag.y)}}>{pad2(dn)}</div>}
    {atlas && <div className="xm-head"><button onPointerDown={stopProp} onClick={onBack}><ArrowLeft size={16}/>Karargâh</button><h1>Harita</h1><p>{captured ? `${open} AÇIK CEPHE · SEFER TAMAMLANDI` : `${open} AÇIK CEPHE · BUGÜNÜN ROTASI ${route.length} KAMP`}</p></div>}
    <div className="xm-zoom" onPointerDown={stopProp}>
      <button aria-label="Yakınlaştır" onClick={() => zoomBy(1.45)}><Plus size={18}/></button><span/>
      <button aria-label="Uzaklaştır" onClick={() => zoomBy(1 / 1.45)}><Minus size={18}/></button><span/>
      <button aria-label={atlas ? 'Tüm cepheleri sığdır' : 'Tüm rotayı sığdır'} onClick={() => animate(fit, true)}><Scan size={18}/></button>
    </div>
    {drag && <div className="xm-bubble">{drag.over ? `Bırakırsan ${pad2(dn)}. sıraya geçer.` : 'Başka bir kampın üstüne bırak.'}</div>}
    {toast && <div className="xm-toast" role="status">{toast}</div>}
    {atlas && !card && !showPending && (legendOpen
      ? <div className="xm-legend" role="button" tabIndex={0} aria-label="Lejantı kapat" onPointerDown={stopProp} onClick={() => setLegend(false)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') { e.preventDefault(); setLegend(false); } }}>
          <span className="xm-legend-lead">Kampın yeri cephe tipini, rengi aciliyeti söyler.</span>
          <span><svg viewBox="0 0 16 12"><path d="M1 11 5.5 3 8.5 7.5 11 4.5 15 11"/><path d="M4 11 5.5 8 7 10"/></svg>DAĞLIK · PROJELER</span>
          <span><svg viewBox="0 0 16 12"><path d="M1 4.5c3-1.6 6 1.6 9 0s4-.8 5 0"/><path d="M1 9c4-1.4 9 1.4 14 0"/></svg>OVA · DERSLER</span>
          <span><svg viewBox="0 0 16 12"><path d="M1 2c3 0 5 8 7 8s4-8 7-8"/><path d="M4.5 2c2 0 2.6 4.5 3.5 4.5S9.5 2 11.5 2"/></svg>GEÇİT · BAŞVURULAR</span>
          <span><svg viewBox="0 0 16 12"><path d="M1 8.5h14"/><path d="M5 5.5h6"/></svg>DÜZLÜK · İŞLER</span>
          <i/>
          <span className="is-hot"><svg viewBox="0 0 16 12" className="is-solid"><circle cx="8" cy="6" r="6" className="xm-key-ring"/><circle cx="8" cy="6" r="3.3" className="xm-key-dot"/></svg>SONAR · {KRITIK > 0 ? KRITIK + ' GÜN VE ALTI' : 'BUGÜN'}</span>
          <span className="is-hot"><svg viewBox="0 0 16 12" className="is-solid"><circle cx="8" cy="6" r="4" className="xm-key-near"/></svg>MERCAN · {YAKLASAN} GÜN VE ALTI</span>
          <span><svg viewBox="0 0 16 12" className="is-solid"><circle cx="8" cy="6" r="4" className="xm-key-calm"/></svg>SAKİN · UZAK VEYA TARİHSİZ</span>
          <i/>
          <span><svg viewBox="0 0 16 12" className="is-dots"><path d="M1 6h14"/></svg>PATİKA · GÜNÜN SIRASI</span>
          <span className="is-gold"><svg viewBox="0 0 16 12" className="is-solid"><path d="M2 6h12" className="xm-key-seal"/><path d="M2 6h12" className="xm-key-seal-core"/></svg>MÜHÜR · ELE GEÇEN HAT</span>
          <span className="is-gold"><Flag size={14} fill="currentColor"/>BAYRAK · GEÇİLEN KAMP</span>
        </div>
      : <button className="xm-chip is-right" onPointerDown={stopProp} onClick={() => setLegend(true)}>NASIL OKUNUR?</button>)}
    {listChip && <button className="xm-chip is-left" onPointerDown={stopProp} onClick={onList}>LİSTE ↓</button>}
    {card && <div className="xm-card" onPointerDown={stopProp}>
      <div className="xm-card-top"><span><i style={{background: `var(--type-${card.fr.type})`}}/>{card.type}</span><button aria-label="Kapat" onClick={() => setSel(null)}><X size={18}/></button></div>
      <h3>{card.fr.title}</h3>
      <p>{card.meta}</p>
      <div className="xm-card-chips"><span className={card.hot ? 'is-hot' : ''}>{card.days}</span><span>{card.route}</span></div>
      {card.move && <p className="xm-card-move"><span>SIRADAKİ HAMLE</span>{card.move}</p>}
      <button className="primary" onClick={() => onOpen?.(card.fr.id)}><span>Cepheyi aç</span><ArrowRight size={18}/></button>
    </div>}
    {showPending && <div className="xm-pending" onPointerDown={stopProp}><span>Yeni sıra hazır.</span><button onClick={() => setPending(null)} disabled={saving}>Vazgeç</button><button className="primary" onClick={save} disabled={saving || !editable}>Sırayı kaydet</button></div>}
  </div>;
}

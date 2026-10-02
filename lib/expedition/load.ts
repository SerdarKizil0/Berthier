// Client-side terrain loader. The terrain is built once per session, in a Web Worker when possible and
// otherwise on the main thread in short slices, and then shared by every map on the page.

import { geoSteps, rasterSteps, regionCands, type Level, type Raster, type RegionCands } from './terrain';

export type TerrainMessage = {
  levels: Level[]; stipple: string; river: string; peaks: [number, number, number][];
  PH: Float32Array; PR: Float32Array; pnx: number; pny: number; cands: RegionCands;
  image: Blob | null; raster: Raster | null;
};

export type MapTerrain = Omit<TerrainMessage, 'image' | 'raster'> & { image: string };

let pending: Promise<MapTerrain> | null = null;

export function loadTerrain(): Promise<MapTerrain> {
  pending ??= viaWorker().catch(inSlices);
  return pending;
}

async function adopt({ image, raster, ...rest }: TerrainMessage): Promise<MapTerrain> {
  const blob = image ?? (raster ? await encode(raster) : null);
  return { ...rest, image: blob ? URL.createObjectURL(blob) : '' };
}

function encode(r: Raster): Promise<Blob | null> {
  const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
  canvas.width = r.width;
  canvas.height = r.height;
  if (!ctx) return Promise.resolve(null);
  ctx.putImageData(new ImageData(r.data as Uint8ClampedArray<ArrayBuffer>, r.width, r.height), 0, 0);
  return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
}

function viaWorker(): Promise<MapTerrain> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./terrain.worker.ts', import.meta.url), { type: 'module' });
    } catch (error) {
      reject(error);
      return;
    }
    const timer = setTimeout(() => { worker.terminate(); reject(Error('Arazi zamanında hazırlanamadı.')); }, 30000);
    worker.onmessage = event => { clearTimeout(timer); worker.terminate(); adopt(event.data as TerrainMessage).then(resolve, reject); };
    worker.onerror = event => { clearTimeout(timer); worker.terminate(); event.preventDefault(); reject(Error(event.message || 'Arazi hazırlanamadı.')); };
    worker.postMessage(null);
  });
}

const later = (fn: () => void) => {
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
  if (idle) idle(fn, { timeout: 120 }); else setTimeout(fn, 0);
};

/** Runs a step generator a few milliseconds at a time so that no single task blocks the page. */
function inSteps<T>(gen: Generator<void, T, void>): Promise<T> {
  return new Promise((resolve, reject) => {
    const tick = () => {
      try {
        const end = performance.now() + 8;
        for (;;) {
          const r = gen.next();
          if (r.done) { resolve(r.value); return; }
          if (performance.now() > end) break;
        }
        later(tick);
      } catch (error) {
        reject(error);
      }
    };
    later(tick);
  });
}

async function inSlices(): Promise<MapTerrain> {
  const geo = await inSteps(geoSteps()), raster = await inSteps(rasterSteps(geo));
  const { levels, stipple, river, peaks, PH, PR, pnx, pny } = geo;
  return adopt({ levels, stipple, river, peaks, PH, PR, pnx, pny, cands: regionCands(geo), image: null, raster });
}

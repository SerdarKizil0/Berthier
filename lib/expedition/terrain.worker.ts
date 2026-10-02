// Builds the expedition terrain off the main thread: contours, stipple, peaks, path-finder grids, region
// name candidates and the shaded relief image (as a JPEG blob when OffscreenCanvas is available).

import { geoSteps, rasterSteps, regionCands, runSteps } from './terrain';
import type { TerrainMessage } from './load';

const scope = self as unknown as {
  onmessage: (() => void) | null;
  postMessage: (message: TerrainMessage, transfer: Transferable[]) => void;
};

scope.onmessage = async () => {
  const geo = runSteps(geoSteps()), cands = regionCands(geo), raster = runSteps(rasterSteps(geo));
  let image: Blob | null = null;
  try {
    const canvas = new OffscreenCanvas(raster.width, raster.height), ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.putImageData(new ImageData(raster.data as Uint8ClampedArray<ArrayBuffer>, raster.width, raster.height), 0, 0);
      image = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
    }
  } catch {
    image = null;
  }
  const { levels, stipple, river, peaks, PH, PR, pnx, pny } = geo;
  const message: TerrainMessage = { levels, stipple, river, peaks, PH, PR, pnx, pny, cands, image, raster: image ? null : raster };
  scope.postMessage(message, [PH.buffer, PR.buffer, ...(image ? [] : [raster.data.buffer])]);
};

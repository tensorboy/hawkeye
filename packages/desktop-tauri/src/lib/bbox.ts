/**
 * Bounding-box utilities for converting between coordinate systems used in
 * Shadow's gaze ↔ entity pipeline.
 *
 * Three coordinate systems exist:
 *
 *   1. Vision normalized    — what macOS Vision returns. (x, y, w, h) in
 *                             [0..1] with origin BOTTOM-LEFT of screenshot.
 *   2. Screenshot pixels    — pixel coords inside the captured screenshot
 *                             (native screen resolution, often Retina 2x),
 *                             origin TOP-LEFT.
 *   3. Browser window px    — what `gazePoint.x/y` produces — pixel coords
 *                             inside `window.innerWidth/innerHeight`, origin
 *                             TOP-LEFT.
 *
 * The screenshot covers the whole physical screen; the browser window is
 * typically smaller. For the MVP (gaze restricted to inside the Shadow app
 * window), we assume gaze coords map 1:1 to a SCALED version of the
 * screenshot — the scaling factor is window-px / screenshot-px per axis.
 */

import type { OcrBoundingBox, OcrBoundingBoxPx, OcrRegion } from '../hooks/useTauri';

/**
 * Convert a Vision-normalized bbox to screen pixel coords (top-left origin)
 * relative to the screenshot at the given dimensions.
 */
export function bboxToScreenPx(
  bbox: OcrBoundingBox,
  screenshotW: number,
  screenshotH: number,
): OcrBoundingBoxPx {
  return {
    xPx: bbox.x * screenshotW,
    yPx: (1 - bbox.y - bbox.height) * screenshotH, // flip Y
    widthPx: bbox.width * screenshotW,
    heightPx: bbox.height * screenshotH,
  };
}

/**
 * Convert screenshot-pixel bbox into the local browser window's coordinate
 * system, scaling proportionally. Assumes the Shadow window covers the
 * same logical screen as the screenshot (the typical setup for the
 * always-on-top main window).
 */
export function screenPxToWindowPx(
  bbox: OcrBoundingBoxPx,
  screenshotW: number,
  screenshotH: number,
  windowW: number = window.innerWidth,
  windowH: number = window.innerHeight,
): OcrBoundingBoxPx {
  const sx = windowW / screenshotW;
  const sy = windowH / screenshotH;
  return {
    xPx: bbox.xPx * sx,
    yPx: bbox.yPx * sy,
    widthPx: bbox.widthPx * sx,
    heightPx: bbox.heightPx * sy,
  };
}

/** Combined helper: Vision-normalized bbox → window pixel coords. */
export function bboxToWindowPx(
  bbox: OcrBoundingBox,
  screenshotW: number,
  screenshotH: number,
  windowW: number = window.innerWidth,
  windowH: number = window.innerHeight,
): OcrBoundingBoxPx {
  const screenPx = bboxToScreenPx(bbox, screenshotW, screenshotH);
  return screenPxToWindowPx(screenPx, screenshotW, screenshotH, windowW, windowH);
}

/** True if `(x, y)` falls inside `bbox` (both in the same coord system). */
export function pointInBbox(x: number, y: number, bbox: OcrBoundingBoxPx): boolean {
  return (
    x >= bbox.xPx &&
    x <= bbox.xPx + bbox.widthPx &&
    y >= bbox.yPx &&
    y <= bbox.yPx + bbox.heightPx
  );
}

/**
 * Hit-test a gaze point against a list of OCR regions. Returns the region
 * whose bbox contains the point and is SMALLEST (most specific) — important
 * because Vision often returns overlapping line + word regions.
 *
 * `regions` should have raw Vision bboxes; this function does the
 * conversion using the supplied screenshot dimensions.
 */
export function hitTestGaze(
  x: number,
  y: number,
  regions: OcrRegion[],
  screenshotW: number,
  screenshotH: number,
  windowW: number = window.innerWidth,
  windowH: number = window.innerHeight,
): { region: OcrRegion; bboxPx: OcrBoundingBoxPx } | null {
  let best: { region: OcrRegion; bboxPx: OcrBoundingBoxPx; area: number } | null = null;

  for (const region of regions) {
    const bboxPx = bboxToWindowPx(region.bbox, screenshotW, screenshotH, windowW, windowH);
    if (!pointInBbox(x, y, bboxPx)) continue;

    const area = bboxPx.widthPx * bboxPx.heightPx;
    if (best === null || area < best.area) {
      best = { region, bboxPx, area };
    }
  }

  if (!best) return null;
  return { region: best.region, bboxPx: best.bboxPx };
}

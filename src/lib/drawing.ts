/**
 * Inkly — drawing engine
 *
 * Pure rendering. Knows nothing about React or state management.
 * Given a canvas, a view transform, and a list of strokes, it draws.
 */

import type { Point, Stroke, View } from "../types";

export const IDENTITY_VIEW: View = { panX: 0, panY: 0, zoom: 1 };

/* ───────── canvas setup ───────── */

/**
 * Configures a canvas for crisp rendering on hi-DPI displays.
 * Call this on mount and again on every resize.
 *
 * Note: the returned context is reset to a clean state but does NOT
 * have the view transform applied — callers apply that via
 * `renderScene` (or `applyView` if drawing manually).
 */
export function setupCanvas(
  canvas: HTMLCanvasElement,
): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) throw new Error("2D context unavailable");

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();

  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  ctx.scale(dpr, dpr);

  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  return ctx;
}

/** Wipe the canvas, ignoring any current transform. */
export function clearCanvas(ctx: CanvasRenderingContext2D): void {
  const { canvas } = ctx;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
}

/* ───────── coordinate conversion ───────── */

/** Convert a screen-space point (relative to canvas) to world space. */
export function screenToWorld(p: Point, view: View): Point {
  return {
    x: (p.x - view.panX) / view.zoom,
    y: (p.y - view.panY) / view.zoom,
  };
}

/** Convert a world-space point to screen space. */
export function worldToScreen(p: Point, view: View): Point {
  return {
    x: p.x * view.zoom + view.panX,
    y: p.y * view.zoom + view.panY,
  };
}

/* ───────── stroke rendering ───────── */

/**
 * Draw a single stroke in world space. Assumes the caller has
 * already applied the view transform (translate + scale) to ctx.
 *
 * Uses quadratic curves between midpoints — the standard trick for
 * smoothing freehand input.
 */
export function drawStroke(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
): void {
  const { points, color, size, tool } = stroke;
  if (points.length === 0) return;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = size;
  ctx.globalCompositeOperation =
    tool === "eraser" ? "destination-out" : "source-over";

  if (points.length === 1) {
    const p = points[0];
    ctx.beginPath();
    ctx.arc(p.x, p.y, size / 2, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
    return;
  }

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);

  for (let i = 1; i < points.length - 1; i++) {
    const cur = points[i];
    const next = points[i + 1];
    const midX = (cur.x + next.x) / 2;
    const midY = (cur.y + next.y) / 2;
    ctx.quadraticCurveTo(cur.x, cur.y, midX, midY);
  }

  const last = points[points.length - 1];
  ctx.lineTo(last.x, last.y);
  ctx.stroke();
  ctx.restore();
}

/**
 * Render every stroke with a view transform applied.
 *
 * The transform is `translate(panX, panY) → scale(zoom, zoom)` —
 * meaning world coordinates get multiplied by zoom first, then
 * shifted by pan. We pass this combined matrix to setTransform
 * directly (instead of separate translate/scale calls) so we don't
 * have to worry about clobbering the DPR scale that setupCanvas applied.
 */
export function renderScene(
  ctx: CanvasRenderingContext2D,
  strokes: Stroke[],
  view: View = IDENTITY_VIEW,
): void {
  clearCanvas(ctx);
  const dpr = window.devicePixelRatio || 1;
  ctx.save();
  // setTransform takes (a, b, c, d, e, f) where the matrix is:
  //   [ a c e ]
  //   [ b d f ]
  //   [ 0 0 1 ]
  // Combined DPR scale × world transform: dpr * (translate(pan) ∘ scale(zoom))
  ctx.setTransform(
    view.zoom * dpr,
    0,
    0,
    view.zoom * dpr,
    view.panX * dpr,
    view.panY * dpr,
  );
  for (const stroke of strokes) {
    drawStroke(ctx, stroke);
  }
  ctx.restore();
}

/* ───────── export ───────── */

/**
 * Export the current canvas as a PNG file. Composites a white background
 * underneath the drawing so the saved image isn't transparent.
 */
export function exportCanvasAsPNG(
  canvas: HTMLCanvasElement,
  filename = "inkly-drawing.png",
): void {
  // Create an offscreen canvas the same size as the live one.
  const out = document.createElement("canvas");
  out.width = canvas.width;
  out.height = canvas.height;
  const ctx = out.getContext("2d");
  if (!ctx) return;

  // White background, then composite the live canvas on top.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(canvas, 0, 0);

  // Trigger a download.
  out.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, "image/png");
}

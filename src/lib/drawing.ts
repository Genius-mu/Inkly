/**
 * Inkly — drawing engine
 *
 * Pure rendering. Knows nothing about React or state management.
 * Given a canvas and a list of strokes, it draws.
 */

import type { Stroke } from "../types";

/**
 * Configures a canvas for crisp rendering on hi-DPI (retina) displays.
 * Call this on mount and again on every window resize.
 */
export function setupCanvas(
  canvas: HTMLCanvasElement,
): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) throw new Error("2D context unavailable");

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();

  // The bitmap is sized to the device pixel ratio, but we scale the
  // drawing context back down so 1 unit = 1 CSS pixel for our code.
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  ctx.scale(dpr, dpr);

  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  return ctx;
}

/** Wipe the canvas. */
export function clearCanvas(ctx: CanvasRenderingContext2D): void {
  const { canvas } = ctx;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
}

/**
 * Draw a single stroke. Uses quadratic curves between midpoints —
 * the standard trick for smoothing freehand input.
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

  // A single point becomes a dot.
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

  // Smooth through midpoints between each pair of points.
  for (let i = 1; i < points.length - 1; i++) {
    const cur = points[i];
    const next = points[i + 1];
    const midX = (cur.x + next.x) / 2;
    const midY = (cur.y + next.y) / 2;
    ctx.quadraticCurveTo(cur.x, cur.y, midX, midY);
  }

  // Final segment — straight line to the last point.
  const last = points[points.length - 1];
  ctx.lineTo(last.x, last.y);
  ctx.stroke();
  ctx.restore();
}

/** Render all strokes in order. Later strokes paint over earlier ones. */
export function renderScene(
  ctx: CanvasRenderingContext2D,
  strokes: Stroke[],
): void {
  clearCanvas(ctx);
  for (const stroke of strokes) {
    drawStroke(ctx, stroke);
  }
}

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

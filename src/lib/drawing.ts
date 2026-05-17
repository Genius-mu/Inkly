/**
 * Inkly — drawing engine
 *
 * Pure rendering + hit-testing. Knows nothing about React or state.
 */

import type {
  Drawable,
  Point,
  Shape,
  StickyColor,
  StickyNote,
  Stroke,
  TextItem,
  View,
} from "../types";

export const IDENTITY_VIEW: View = { panX: 0, panY: 0, zoom: 1 };

/* ───────── canvas setup ───────── */

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

export function clearCanvas(ctx: CanvasRenderingContext2D): void {
  const { canvas } = ctx;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
}

/* ───────── coordinate conversion ───────── */

export function screenToWorld(p: Point, view: View): Point {
  return {
    x: (p.x - view.panX) / view.zoom,
    y: (p.y - view.panY) / view.zoom,
  };
}

export function worldToScreen(p: Point, view: View): Point {
  return {
    x: p.x * view.zoom + view.panX,
    y: p.y * view.zoom + view.panY,
  };
}

/* ───────── stroke / shape / text / sticky rendering ───────── */

function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke): void {
  const { points, color, size, tool } = s;
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
    ctx.quadraticCurveTo(
      cur.x,
      cur.y,
      (cur.x + next.x) / 2,
      (cur.y + next.y) / 2,
    );
  }
  const last = points[points.length - 1];
  ctx.lineTo(last.x, last.y);
  ctx.stroke();
  ctx.restore();
}

function drawShape(ctx: CanvasRenderingContext2D, s: Shape): void {
  const { start, end, color, size, variant } = s;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = size;
  ctx.fillStyle = color;

  switch (variant) {
    case "rect": {
      const x = Math.min(start.x, end.x);
      const y = Math.min(start.y, end.y);
      const w = Math.abs(end.x - start.x);
      const h = Math.abs(end.y - start.y);
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.stroke();
      break;
    }
    case "ellipse": {
      const cx = (start.x + end.x) / 2;
      const cy = (start.y + end.y) / 2;
      const rx = Math.abs(end.x - start.x) / 2;
      const ry = Math.abs(end.y - start.y) / 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case "line": {
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      break;
    }
    case "arrow": {
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      const angle = Math.atan2(end.y - start.y, end.x - start.x);
      const headLength = Math.max(size * 3, 12);
      const wing = Math.PI / 7;
      ctx.beginPath();
      ctx.moveTo(end.x, end.y);
      ctx.lineTo(
        end.x - headLength * Math.cos(angle - wing),
        end.y - headLength * Math.sin(angle - wing),
      );
      ctx.moveTo(end.x, end.y);
      ctx.lineTo(
        end.x - headLength * Math.cos(angle + wing),
        end.y - headLength * Math.sin(angle + wing),
      );
      ctx.stroke();
      break;
    }
  }
  ctx.restore();
}

function drawText(ctx: CanvasRenderingContext2D, t: TextItem): void {
  ctx.save();
  ctx.fillStyle = t.color;
  ctx.textBaseline = "top";
  ctx.font = `${t.fontSize}px Geist, ui-sans-serif, system-ui, sans-serif`;
  const lines = t.text.split("\n");
  const lineHeight = t.fontSize * 1.25;
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], t.position.x, t.position.y + i * lineHeight);
  }
  ctx.restore();
}

/* ───────── sticky notes ───────── */

const STICKY_BG: Record<StickyColor, string> = {
  yellow: "#fef9c3",
  pink: "#fce7f3",
  blue: "#dbeafe",
  green: "#dcfce7",
};

const STICKY_BORDER: Record<StickyColor, string> = {
  yellow: "#facc15",
  pink: "#f9a8d4",
  blue: "#93c5fd",
  green: "#86efac",
};

export const STICKY_W = 240;
export const STICKY_H = 180;

function drawSticky(ctx: CanvasRenderingContext2D, n: StickyNote): void {
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.15)";
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 4;

  ctx.fillStyle = STICKY_BG[n.background];
  ctx.strokeStyle = STICKY_BORDER[n.background];
  ctx.lineWidth = 1.5;
  roundRect(ctx, n.position.x, n.position.y, STICKY_W, STICKY_H, 8);
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.stroke();

  ctx.fillStyle = "#1a1a1a";
  ctx.textBaseline = "top";
  ctx.font = "16px Geist, ui-sans-serif, system-ui, sans-serif";
  const padding = 16;
  const lines = wrapText(ctx, n.text, STICKY_W - padding * 2);
  const lineHeight = 22;
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(
      lines[i],
      n.position.x + padding,
      n.position.y + padding + i * lineHeight,
    );
  }
  ctx.restore();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  if (!text) return [""];
  const paragraphs = text.split("\n");
  const out: string[] = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.split(" ");
    let line = "";
    for (const word of words) {
      const next = line ? line + " " + word : word;
      if (ctx.measureText(next).width > maxWidth && line) {
        out.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    out.push(line);
  }
  return out;
}

/* ───────── dispatch ───────── */

export function drawDrawable(ctx: CanvasRenderingContext2D, d: Drawable): void {
  switch (d.kind) {
    case "stroke":
      return drawStroke(ctx, d);
    case "shape":
      return drawShape(ctx, d);
    case "text":
      return drawText(ctx, d);
    case "sticky":
      return drawSticky(ctx, d);
  }
}

/**
 * Render every drawable with a view transform applied.
 *
 * @param skipId If provided, the drawable with this id is omitted —
 *   used while text-editing so the canvas doesn't double-render under
 *   the live DOM textarea.
 */
export function renderScene(
  ctx: CanvasRenderingContext2D,
  drawables: Drawable[],
  view: View = IDENTITY_VIEW,
  skipId: string | null = null,
): void {
  clearCanvas(ctx);
  const dpr = window.devicePixelRatio || 1;
  ctx.save();
  ctx.setTransform(
    view.zoom * dpr,
    0,
    0,
    view.zoom * dpr,
    view.panX * dpr,
    view.panY * dpr,
  );
  for (const d of drawables) {
    if (d.id === skipId) continue;
    drawDrawable(ctx, d);
  }
  ctx.restore();
}

/* ───────── hit-testing ───────── */

/**
 * Approximate text bounding box in world space. We can't measure
 * arbitrary text without a canvas context, so we use a heuristic
 * based on max line length and font size. Good enough for click-
 * targeting; the editable textarea will set its own real size.
 */
function textBoundsApprox(t: TextItem): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  const lines = t.text.split("\n");
  const maxLen = lines.reduce((m, l) => Math.max(m, l.length), 0);
  // Roughly 0.55 em per character is a decent average for sans-serif.
  const w = Math.max(maxLen * t.fontSize * 0.55, 40);
  const h = lines.length * t.fontSize * 1.25;
  return { x: t.position.x, y: t.position.y, w, h };
}

function pointInRect(
  p: Point,
  r: { x: number; y: number; w: number; h: number },
): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

/**
 * Find the topmost editable drawable under a world point. Returns
 * null if no text or sticky is at that position. Iterates back-to-
 * front because later drawables paint over earlier ones.
 *
 * Only text and sticky kinds are tested — strokes and shapes aren't
 * editable. (Object-erase will get its own hit-test later.)
 */
export function hitTestEditable(
  worldPoint: Point,
  drawables: Drawable[],
): Drawable | null {
  for (let i = drawables.length - 1; i >= 0; i--) {
    const d = drawables[i];
    if (d.kind === "text") {
      if (pointInRect(worldPoint, textBoundsApprox(d))) return d;
    } else if (d.kind === "sticky") {
      if (
        pointInRect(worldPoint, {
          x: d.position.x,
          y: d.position.y,
          w: STICKY_W,
          h: STICKY_H,
        })
      ) {
        return d;
      }
    }
  }
  return null;
}

/* ───────── export ───────── */

export function exportCanvasAsPNG(
  canvas: HTMLCanvasElement,
  filename = "inkly-drawing.png",
): void {
  const out = document.createElement("canvas");
  out.width = canvas.width;
  out.height = canvas.height;
  const ctx = out.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(canvas, 0, 0);
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

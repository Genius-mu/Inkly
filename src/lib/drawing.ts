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

/** Color of the selection outline and handles. Same as the signal blue. */
const SELECTION_COLOR = "#2563eb";

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

/* ───────── selection outline ───────── */

/**
 * Draw the selection outline + corner handles around a drawable's
 * bounding box. The canvas already has the world-transform applied,
 * so we divide line widths and handle sizes by `zoom` to keep them
 * screen-pixel-sized regardless of zoom level.
 */
function drawSelectionOutline(
  ctx: CanvasRenderingContext2D,
  d: Drawable,
  zoom: number,
): void {
  const b = getBounds(d);
  if (b.w === 0 && b.h === 0) return;

  // Inflate the outline a touch beyond the bounds, in screen pixels.
  const inflate = 6 / zoom;
  const x = b.x - inflate;
  const y = b.y - inflate;
  const w = b.w + inflate * 2;
  const h = b.h + inflate * 2;

  ctx.save();
  ctx.strokeStyle = SELECTION_COLOR;
  ctx.lineWidth = 1.5 / zoom;

  // The outline itself.
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.stroke();

  // Corner handles — small filled squares with a white border so
  // they're visible against any underlying color.
  const handleSize = 8 / zoom;
  const half = handleSize / 2;
  const corners = [
    { x: x, y: y },
    { x: x + w, y: y },
    { x: x, y: y + h },
    { x: x + w, y: y + h },
  ];
  for (const c of corners) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(c.x - half, c.y - half, handleSize, handleSize);
    ctx.strokeStyle = SELECTION_COLOR;
    ctx.lineWidth = 1.5 / zoom;
    ctx.strokeRect(c.x - half, c.y - half, handleSize, handleSize);
  }
  ctx.restore();
}

/* ───────── scene rendering ───────── */

/**
 * Render every drawable with a view transform applied. Optionally
 * draws selection outlines for drawables whose ids are in selectedIds.
 *
 * @param skipId Drawable to omit from rendering — used during text
 *   editing to avoid double-rendering under the DOM textarea.
 * @param selectedIds Drawables to draw selection outlines around.
 */
export function renderScene(
  ctx: CanvasRenderingContext2D,
  drawables: Drawable[],
  view: View = IDENTITY_VIEW,
  skipId: string | null = null,
  selectedIds: Set<string> = new Set(),
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

  // First pass: all drawables in their natural order.
  for (const d of drawables) {
    if (d.id === skipId) continue;
    drawDrawable(ctx, d);
  }

  // Second pass: selection outlines on top of everything.
  if (selectedIds.size > 0) {
    for (const d of drawables) {
      if (selectedIds.has(d.id) && d.id !== skipId) {
        drawSelectionOutline(ctx, d, view.zoom);
      }
    }
  }

  ctx.restore();
}

/* ───────── geometry for hit-testing ───────── */

function pointToSegmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const closestX = a.x + t * dx;
  const closestY = a.y + t * dy;
  return Math.hypot(p.x - closestX, p.y - closestY);
}

function pointToPolylineDistance(p: Point, points: Point[]): number {
  if (points.length === 0) return Infinity;
  if (points.length === 1) {
    return Math.hypot(p.x - points[0].x, p.y - points[0].y);
  }
  let min = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const d = pointToSegmentDistance(p, points[i], points[i + 1]);
    if (d < min) min = d;
  }
  return min;
}

function pointToRectOutlineDistance(
  p: Point,
  x: number,
  y: number,
  w: number,
  h: number,
): number {
  const tl = { x, y };
  const tr = { x: x + w, y };
  const br = { x: x + w, y: y + h };
  const bl = { x, y: y + h };
  return Math.min(
    pointToSegmentDistance(p, tl, tr),
    pointToSegmentDistance(p, tr, br),
    pointToSegmentDistance(p, br, bl),
    pointToSegmentDistance(p, bl, tl),
  );
}

function pointToEllipseDistance(
  p: Point,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
): number {
  if (rx === 0 || ry === 0) return Math.hypot(p.x - cx, p.y - cy);
  const nx = (p.x - cx) / rx;
  const ny = (p.y - cy) / ry;
  const len = Math.hypot(nx, ny);
  if (len === 0) return Math.min(rx, ry);
  const closestX = cx + (nx / len) * rx;
  const closestY = cy + (ny / len) * ry;
  return Math.hypot(p.x - closestX, p.y - closestY);
}

/* ───────── editable-only hit-test (for double-click → edit text) ───────── */

function textBoundsApprox(t: TextItem): Bounds {
  const lines = t.text.split("\n");
  const maxLen = lines.reduce((m, l) => Math.max(m, l.length), 0);
  const w = Math.max(maxLen * t.fontSize * 0.55, 40);
  const h = lines.length * t.fontSize * 1.25;
  return { x: t.position.x, y: t.position.y, w, h };
}

function pointInRect(p: Point, r: Bounds): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

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

/* ───────── precise hit-test (for object eraser) ───────── */

export function hitTestAny(
  worldPoint: Point,
  drawables: Drawable[],
  tolerance = 4,
): Drawable | null {
  for (let i = drawables.length - 1; i >= 0; i--) {
    const d = drawables[i];
    if (didHit(worldPoint, d, tolerance)) return d;
  }
  return null;
}

function didHit(p: Point, d: Drawable, tolerance: number): boolean {
  switch (d.kind) {
    case "stroke": {
      const r = d.size / 2 + tolerance;
      return pointToPolylineDistance(p, d.points) <= r;
    }
    case "shape": {
      const r = d.size / 2 + tolerance;
      switch (d.variant) {
        case "rect": {
          const x = Math.min(d.start.x, d.end.x);
          const y = Math.min(d.start.y, d.end.y);
          const w = Math.abs(d.end.x - d.start.x);
          const h = Math.abs(d.end.y - d.start.y);
          return pointToRectOutlineDistance(p, x, y, w, h) <= r;
        }
        case "ellipse": {
          const cx = (d.start.x + d.end.x) / 2;
          const cy = (d.start.y + d.end.y) / 2;
          const rx = Math.abs(d.end.x - d.start.x) / 2;
          const ry = Math.abs(d.end.y - d.start.y) / 2;
          return pointToEllipseDistance(p, cx, cy, rx, ry) <= r;
        }
        case "line":
        case "arrow":
          return pointToSegmentDistance(p, d.start, d.end) <= r;
      }
      return false;
    }
    case "text": {
      return pointInRect(p, textBoundsApprox(d));
    }
    case "sticky": {
      return pointInRect(p, {
        x: d.position.x,
        y: d.position.y,
        w: STICKY_W,
        h: STICKY_H,
      });
    }
  }
}

/* ───────── bounds (for selection outlines + drag math) ───────── */

export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function getBounds(d: Drawable): Bounds {
  switch (d.kind) {
    case "stroke": {
      if (d.points.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      for (const p of d.points) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
      const pad = d.size / 2;
      return {
        x: minX - pad,
        y: minY - pad,
        w: maxX - minX + pad * 2,
        h: maxY - minY + pad * 2,
      };
    }
    case "shape": {
      const x = Math.min(d.start.x, d.end.x);
      const y = Math.min(d.start.y, d.end.y);
      const w = Math.abs(d.end.x - d.start.x);
      const h = Math.abs(d.end.y - d.start.y);
      const pad = d.size / 2;
      return { x: x - pad, y: y - pad, w: w + pad * 2, h: h + pad * 2 };
    }
    case "text": {
      return textBoundsApprox(d);
    }
    case "sticky": {
      return { x: d.position.x, y: d.position.y, w: STICKY_W, h: STICKY_H };
    }
  }
}

/* ───────── translation (for drag-to-move in Step 31c) ───────── */

export function translateDrawable(
  d: Drawable,
  dx: number,
  dy: number,
): Drawable {
  switch (d.kind) {
    case "stroke":
      return {
        ...d,
        points: d.points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
      };
    case "shape":
      return {
        ...d,
        start: { x: d.start.x + dx, y: d.start.y + dy },
        end: { x: d.end.x + dx, y: d.end.y + dy },
      };
    case "text":
      return {
        ...d,
        position: { x: d.position.x + dx, y: d.position.y + dy },
      };
    case "sticky":
      return {
        ...d,
        position: { x: d.position.x + dx, y: d.position.y + dy },
      };
  }
}

/* ───────── permissive hit-test (for selection) ───────── */

export function hitTestSelection(
  worldPoint: Point,
  drawables: Drawable[],
): Drawable | null {
  for (let i = drawables.length - 1; i >= 0; i--) {
    const d = drawables[i];
    if (pointInRect(worldPoint, getBounds(d))) return d;
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

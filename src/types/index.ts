/**
 * Inkly — shared types
 *
 * The contract between the drawing engine, the store, and the
 * realtime layer. Keep these stable — changing them ripples
 * through every module.
 */

/** A single pointer sample inside a stroke. */
export interface Point {
  x: number;
  y: number;
}

/** Common fields on every drawable thing. */
interface BaseDrawable {
  /** Globally unique id. Generated client-side. */
  id: string;
  /** Author user id. */
  userId: string;
  /** Client timestamp (ms). Used for deterministic ordering. */
  createdAt: number;
}

/* ─── strokes ─────────────────────────────────────────────────── */

/**
 * Freehand pen stroke. The original drawable, and still the
 * most-used one.
 */
export interface Stroke extends BaseDrawable {
  kind: "stroke";
  /** Tool used. Eraser is just stroke with composite mode. */
  tool: "pen" | "eraser";
  /** CSS hex color. Ignored for eraser. */
  color: string;
  /** Brush size in CSS pixels (world space). */
  size: number;
  /** Ordered list of points in world space. */
  points: Point[];
}

/* ─── shapes ──────────────────────────────────────────────────── */

/**
 * A primitive shape defined by two points (start and end) in world
 * space. The shape variant determines how those two points are
 * interpreted — rect/ellipse use them as corners of a bounding box,
 * line/arrow use them as endpoints.
 */
export interface Shape extends BaseDrawable {
  kind: "shape";
  variant: "rect" | "ellipse" | "line" | "arrow";
  /** Start point in world space. */
  start: Point;
  /** End point in world space. */
  end: Point;
  /** Outline color (CSS hex). */
  color: string;
  /** Stroke width in CSS pixels (world space). */
  size: number;
}

/* ─── text ────────────────────────────────────────────────────── */

/**
 * A piece of editable text anchored at a world-space point.
 * The width auto-expands with the text; height grows on wrap.
 */
export interface TextItem extends BaseDrawable {
  kind: "text";
  /** Top-left anchor in world space. */
  position: Point;
  text: string;
  color: string;
  fontSize: number;
}

/* ─── sticky notes ────────────────────────────────────────────── */

/** Available sticky-note background colors. */
export type StickyColor = "yellow" | "pink" | "blue" | "green";

/**
 * A sticky note — text on a colored background. Fixed dimensions
 * (240×180 in world space) for predictable layout.
 */
export interface StickyNote extends BaseDrawable {
  kind: "sticky";
  /** Top-left anchor in world space. */
  position: Point;
  text: string;
  /** Background color preset. */
  background: StickyColor;
}

/* ─── union ───────────────────────────────────────────────────── */

/**
 * Anything the user can put on the canvas. The `kind` field is the
 * discriminator — TypeScript narrows to the right shape inside an
 * `if (d.kind === 'shape')` branch.
 */
export type Drawable = Stroke | Shape | TextItem | StickyNote;

/* ─── view & users ────────────────────────────────────────────── */

export interface View {
  panX: number;
  panY: number;
  zoom: number;
}

export interface User {
  id: string;
  name: string;
  color: string;
}

export interface RemoteCursor {
  userId: string;
  name: string;
  color: string;
  x: number;
  y: number;
  updatedAt: number;
}

/** Realtime payload — what we send over broadcast channels. */
export type DrawAction =
  | { type: "drawable"; drawable: Drawable }
  | { type: "delete"; id: string; userId: string; at: number }
  | { type: "clear"; userId: string; at: number };

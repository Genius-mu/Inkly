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

/** A complete stroke — the atomic unit of drawing in Inkly. */
export interface Stroke {
  /** Globally unique id. Generated client-side. */
  id: string;
  /** Author user id (the local user, or a remote one). */
  userId: string;
  /** Tool used. Eraser is just stroke with composite mode. */
  tool: "pen" | "eraser";
  /** CSS hex color. Ignored for eraser. */
  color: string;
  /** Brush size in CSS pixels (in world space). */
  size: number;
  /**
   * Ordered list of points in **world space**.
   * Independent of the current pan/zoom — strokes look the same
   * whether you draw them at 25% or 400%.
   */
  points: Point[];
  /** Client timestamp (ms). Used for deterministic ordering. */
  createdAt: number;
}

/**
 * The current view transform.
 *
 *   screen point → world point:  world = (screen - pan) / zoom
 *   world point  → screen point: screen = world * zoom + pan
 *
 * `pan` is the screen-space offset of the world origin.
 * `zoom` is uniform scale; 1 = 100%.
 */
export interface View {
  panX: number;
  panY: number;
  zoom: number;
}

/** Local user identity. */
export interface User {
  id: string;
  name: string;
  color: string;
}

/** Live cursor position broadcast by a remote user. */
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
  | { type: "stroke"; stroke: Stroke }
  | { type: "clear"; userId: string; at: number };

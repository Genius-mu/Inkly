/**
 * Inkly — shared types
 *
 * The contract between the drawing engine, the store, and (later)
 * the realtime layer. Keep these stable — changing them ripples
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
  /** Author user id. (Just "local" in single-player mode.) */
  userId: string;
  /** Tool used. Eraser is just stroke with composite mode. */
  tool: "pen" | "eraser";
  /** CSS hex color. Ignored for eraser. */
  color: string;
  /** Brush size in CSS pixels. */
  size: number;
  /** Ordered list of points making up the path. */
  points: Point[];
  /** Client timestamp (ms). Used for ordering. */
  createdAt: number;
}

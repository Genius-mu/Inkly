/**
 * Inkly — global state
 *
 * Single source of truth for: strokes on the canvas (world-space),
 * the current pan/zoom view, the undo/redo stacks, and the active
 * tool/color/size selection.
 */

import { create } from "zustand";
import type { Stroke, View } from "../types";

const MIN_ZOOM = 0.1; // 10%
const MAX_ZOOM = 8; // 800%
const DEFAULT_VIEW: View = { panX: 0, panY: 0, zoom: 1 };

interface InklyState {
  // Drawing state
  strokes: Stroke[];
  redoStack: Stroke[];

  // View state
  view: View;

  // Tool state
  color: string;
  size: number;
  tool: "pen" | "eraser";

  // Drawing actions
  addStroke: (stroke: Stroke) => void;
  undo: () => void;
  redo: () => void;
  clearAll: () => void;

  // View actions
  setView: (view: View) => void;
  panBy: (dx: number, dy: number) => void;
  /**
   * Zoom toward a fixed screen point — the point on the canvas where
   * the mouse / pinch center is stays put while everything scales.
   * Without this, zooming feels like the canvas is sliding under you.
   */
  zoomAt: (factor: number, screenX: number, screenY: number) => void;
  resetView: () => void;

  // Tool actions
  setColor: (color: string) => void;
  setSize: (size: number) => void;
  setTool: (tool: "pen" | "eraser") => void;
}

function clampZoom(z: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
}

export const useStore = create<InklyState>((set, get) => ({
  // ─── initial state ──────────────────────────────────────────
  strokes: [],
  redoStack: [],

  view: DEFAULT_VIEW,

  color: "#0a0a0a",
  size: 4,
  tool: "pen",

  // ─── drawing actions ────────────────────────────────────────
  addStroke: (stroke) =>
    set((state) => ({
      strokes: [...state.strokes, stroke],
      redoStack: [],
    })),

  undo: () => {
    const { strokes } = get();
    if (strokes.length === 0) return;
    const last = strokes[strokes.length - 1];
    set((state) => ({
      strokes: state.strokes.slice(0, -1),
      redoStack: [...state.redoStack, last],
    }));
  },

  redo: () => {
    const { redoStack } = get();
    if (redoStack.length === 0) return;
    const stroke = redoStack[redoStack.length - 1];
    set((state) => ({
      strokes: [...state.strokes, stroke],
      redoStack: state.redoStack.slice(0, -1),
    }));
  },

  clearAll: () => set({ strokes: [], redoStack: [] }),

  // ─── view actions ───────────────────────────────────────────
  setView: (view) => set({ view: { ...view, zoom: clampZoom(view.zoom) } }),

  panBy: (dx, dy) =>
    set((state) => ({
      view: {
        ...state.view,
        panX: state.view.panX + dx,
        panY: state.view.panY + dy,
      },
    })),

  zoomAt: (factor, screenX, screenY) =>
    set((state) => {
      const { panX, panY, zoom } = state.view;
      const nextZoom = clampZoom(zoom * factor);
      // The world point under the cursor before zoom:
      //   wx = (screenX - panX) / zoom
      //   wy = (screenY - panY) / zoom
      // After zoom, we want the same world point under the cursor:
      //   screenX = wx * nextZoom + nextPanX  →  nextPanX = screenX - wx * nextZoom
      const wx = (screenX - panX) / zoom;
      const wy = (screenY - panY) / zoom;
      return {
        view: {
          panX: screenX - wx * nextZoom,
          panY: screenY - wy * nextZoom,
          zoom: nextZoom,
        },
      };
    }),

  resetView: () => set({ view: DEFAULT_VIEW }),

  // ─── tool actions ───────────────────────────────────────────
  setColor: (color) => set({ color, tool: "pen" }),
  setSize: (size) => set({ size }),
  setTool: (tool) => set({ tool }),
}));

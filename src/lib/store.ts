/**
 * Inkly — global state
 *
 * Single source of truth for: drawables on the canvas (world-space),
 * the current pan/zoom view, the undo/redo stacks, and the active
 * tool/color/size selection.
 */

import { create } from "zustand";
import type { Drawable, StickyColor, View } from "../types";

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 8;
const DEFAULT_VIEW: View = { panX: 0, panY: 0, zoom: 1 };

/** Every tool the user can pick. */
export type Tool =
  | "pen"
  | "eraser" // pixel eraser (existing)
  | "object-eraser" // click a drawable to delete it
  | "rect"
  | "ellipse"
  | "line"
  | "arrow"
  | "text"
  | "sticky";

interface InklyState {
  // Drawing state
  drawables: Drawable[];
  redoStack: Drawable[];

  // View state
  view: View;

  // Tool state
  color: string;
  size: number;
  tool: Tool;
  /** Background color for the next sticky note. */
  stickyColor: StickyColor;

  // Drawable actions
  addDrawable: (d: Drawable) => void;
  removeDrawable: (id: string) => void;
  undo: () => void;
  redo: () => void;
  clearAll: () => void;

  // View actions
  setView: (view: View) => void;
  panBy: (dx: number, dy: number) => void;
  zoomAt: (factor: number, screenX: number, screenY: number) => void;
  resetView: () => void;

  // Tool actions
  setColor: (color: string) => void;
  setSize: (size: number) => void;
  setTool: (tool: Tool) => void;
  setStickyColor: (c: StickyColor) => void;
}

function clampZoom(z: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
}

export const useStore = create<InklyState>((set, get) => ({
  // ─── initial state ──────────────────────────────────────────
  drawables: [],
  redoStack: [],

  view: DEFAULT_VIEW,

  color: "#0a0a0a",
  size: 4,
  tool: "pen",
  stickyColor: "yellow",

  // ─── drawable actions ───────────────────────────────────────
  addDrawable: (d) =>
    set((state) => ({
      drawables: [...state.drawables, d],
      redoStack: [],
    })),

  removeDrawable: (id) =>
    set((state) => {
      const removed = state.drawables.find((d) => d.id === id);
      if (!removed) return state;
      return {
        drawables: state.drawables.filter((d) => d.id !== id),
        // Object-erase pushes onto redo, like undo does.
        redoStack: [...state.redoStack, removed],
      };
    }),

  undo: () => {
    const { drawables } = get();
    if (drawables.length === 0) return;
    const last = drawables[drawables.length - 1];
    set((state) => ({
      drawables: state.drawables.slice(0, -1),
      redoStack: [...state.redoStack, last],
    }));
  },

  redo: () => {
    const { redoStack } = get();
    if (redoStack.length === 0) return;
    const d = redoStack[redoStack.length - 1];
    set((state) => ({
      drawables: [...state.drawables, d],
      redoStack: state.redoStack.slice(0, -1),
    }));
  },

  clearAll: () => set({ drawables: [], redoStack: [] }),

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
  setColor: (color) =>
    set((state) => ({
      color,
      // Stay in shape/text tools when changing color; only auto-switch
      // from eraser/object-eraser, where color doesn't apply.
      tool:
        state.tool === "eraser" || state.tool === "object-eraser"
          ? "pen"
          : state.tool,
    })),
  setSize: (size) => set({ size }),
  setTool: (tool) => set({ tool }),
  setStickyColor: (stickyColor) => set({ stickyColor }),
}));

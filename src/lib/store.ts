/**
 * Inkly — global state
 *
 * Single source of truth for: drawables on the canvas (world-space),
 * the current pan/zoom view, the undo/redo stacks, the active tool
 * selection, and the id of the drawable currently being text-edited.
 */

import { create } from "zustand";
import type { Drawable, StickyColor, View } from "../types";

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 8;
const DEFAULT_VIEW: View = { panX: 0, panY: 0, zoom: 1 };

/** Every tool the user can pick. */
export type Tool =
  | "pen"
  | "eraser"
  | "object-eraser"
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
  /**
   * The id of the drawable currently in DOM-editor mode (text/sticky).
   * The canvas renderer skips this one while it's being edited so it
   * doesn't double-render under the live textarea.
   */
  editingId: string | null;

  // View state
  view: View;

  // Tool state
  color: string;
  size: number;
  tool: Tool;
  stickyColor: StickyColor;

  // Drawable actions
  addDrawable: (d: Drawable) => void;
  updateDrawable: (id: string, patch: Partial<Drawable>) => void;
  removeDrawable: (id: string) => void;
  undo: () => void;
  redo: () => void;
  clearAll: () => void;

  // Editing actions
  startEditing: (id: string) => void;
  finishEditing: () => void;

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
  editingId: null,

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

  /**
   * Apply a partial patch to an existing drawable. Used while text
   * editing — we keep the drawable in the store with placeholder text
   * and update it as the user types. (`as Drawable` cast: the
   * discriminated union doesn't merge cleanly with Partial, but at
   * runtime we only ever patch fields that exist on the matched kind.)
   */
  updateDrawable: (id, patch) =>
    set((state) => ({
      drawables: state.drawables.map((d) =>
        d.id === id ? ({ ...d, ...patch } as Drawable) : d,
      ),
    })),

  removeDrawable: (id) =>
    set((state) => {
      const removed = state.drawables.find((d) => d.id === id);
      if (!removed) return state;
      return {
        drawables: state.drawables.filter((d) => d.id !== id),
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

  clearAll: () => set({ drawables: [], redoStack: [], editingId: null }),

  // ─── editing actions ────────────────────────────────────────
  startEditing: (id) => set({ editingId: id }),

  finishEditing: () =>
    set((state) => {
      // If the drawable being edited has empty content, drop it
      // entirely — empty text/stickies are clutter from accidental clicks.
      const editingId = state.editingId;
      if (!editingId) return { editingId: null };
      const d = state.drawables.find((x) => x.id === editingId);
      if (
        d &&
        (d.kind === "text" || d.kind === "sticky") &&
        d.text.trim() === ""
      ) {
        return {
          editingId: null,
          drawables: state.drawables.filter((x) => x.id !== editingId),
        };
      }
      return { editingId: null };
    }),

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
      tool:
        state.tool === "eraser" || state.tool === "object-eraser"
          ? "pen"
          : state.tool,
    })),
  setSize: (size) => set({ size }),
  setTool: (tool) => set({ tool }),
  setStickyColor: (stickyColor) => set({ stickyColor }),
}));

/**
 * Inkly — global state
 *
 * Single source of truth for: drawables on the canvas, the current
 * pan/zoom view, the undo/redo stacks, the active tool, the id of
 * the drawable currently being text-edited, which drawables are
 * selected, the signed-in user, and a recency timestamp for the
 * activity pulse.
 */

import { create } from "zustand";
import type { Drawable, StickyColor, User, View } from "../types";

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 8;
const DEFAULT_VIEW: View = { panX: 0, panY: 0, zoom: 1 };

export type Tool =
  | "select" // ← NEW
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
  // Auth state
  user: User | null;
  authReady: boolean;

  // Drawing state
  drawables: Drawable[];
  redoStack: Drawable[];
  editingId: string | null;
  lastActivityAt: number;

  // Selection state
  selectedIds: Set<string>;

  // View state
  view: View;

  // Tool state
  color: string;
  size: number;
  tool: Tool;
  stickyColor: StickyColor;

  // Auth actions
  setUser: (user: User | null) => void;
  setAuthReady: (ready: boolean) => void;

  // Drawable actions
  addDrawable: (d: Drawable) => void;
  updateDrawable: (id: string, patch: Partial<Drawable>) => void;
  replaceDrawable: (d: Drawable) => void;
  removeDrawable: (id: string) => void;
  removeMany: (ids: string[]) => void;
  undo: () => void;
  redo: () => void;
  clearAll: () => void;

  // Editing actions
  startEditing: (id: string) => void;
  finishEditing: () => void;

  // Selection actions
  selectOne: (id: string) => void;
  toggleSelected: (id: string) => void;
  selectMany: (ids: string[]) => void;
  clearSelection: () => void;

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
  user: null,
  authReady: false,

  drawables: [],
  redoStack: [],
  editingId: null,
  lastActivityAt: 0,

  selectedIds: new Set<string>(),

  view: DEFAULT_VIEW,

  color: "#0a0a0a",
  size: 4,
  tool: "pen",
  stickyColor: "yellow",

  // ─── auth actions ───────────────────────────────────────────
  setUser: (user) => set({ user }),
  setAuthReady: (authReady) => set({ authReady }),

  // ─── drawable actions ───────────────────────────────────────
  addDrawable: (d) =>
    set((state) => ({
      drawables: [...state.drawables, d],
      redoStack: [],
      lastActivityAt: Date.now(),
    })),

  updateDrawable: (id, patch) =>
    set((state) => ({
      drawables: state.drawables.map((d) =>
        d.id === id ? ({ ...d, ...patch } as Drawable) : d,
      ),
      lastActivityAt: Date.now(),
    })),

  /**
   * Replace a drawable with a new (translated, transformed, etc.)
   * version that has the same id. Used by drag-to-move so the
   * type-safe per-kind logic lives outside the store.
   */
  replaceDrawable: (next) =>
    set((state) => ({
      drawables: state.drawables.map((d) => (d.id === next.id ? next : d)),
      lastActivityAt: Date.now(),
    })),

  removeDrawable: (id) =>
    set((state) => {
      const removed = state.drawables.find((d) => d.id === id);
      if (!removed) return state;
      const nextSelected = new Set(state.selectedIds);
      nextSelected.delete(id);
      return {
        drawables: state.drawables.filter((d) => d.id !== id),
        redoStack: [...state.redoStack, removed],
        selectedIds: nextSelected,
        lastActivityAt: Date.now(),
      };
    }),

  /** Bulk delete — used by Backspace on a multi-selection. */
  removeMany: (ids) =>
    set((state) => {
      const idSet = new Set(ids);
      const removed = state.drawables.filter((d) => idSet.has(d.id));
      if (removed.length === 0) return state;
      return {
        drawables: state.drawables.filter((d) => !idSet.has(d.id)),
        redoStack: [...state.redoStack, ...removed],
        selectedIds: new Set(),
        lastActivityAt: Date.now(),
      };
    }),

  undo: () => {
    const { drawables } = get();
    if (drawables.length === 0) return;
    const last = drawables[drawables.length - 1];
    set((state) => ({
      drawables: state.drawables.slice(0, -1),
      redoStack: [...state.redoStack, last],
      lastActivityAt: Date.now(),
    }));
  },

  redo: () => {
    const { redoStack } = get();
    if (redoStack.length === 0) return;
    const d = redoStack[redoStack.length - 1];
    set((state) => ({
      drawables: [...state.drawables, d],
      redoStack: state.redoStack.slice(0, -1),
      lastActivityAt: Date.now(),
    }));
  },

  clearAll: () =>
    set({
      drawables: [],
      redoStack: [],
      editingId: null,
      selectedIds: new Set(),
      lastActivityAt: Date.now(),
    }),

  // ─── editing actions ────────────────────────────────────────
  startEditing: (id) => set({ editingId: id }),

  finishEditing: () =>
    set((state) => {
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
          lastActivityAt: Date.now(),
        };
      }
      return { editingId: null };
    }),

  // ─── selection actions ──────────────────────────────────────
  selectOne: (id) => set({ selectedIds: new Set([id]) }),

  toggleSelected: (id) =>
    set((state) => {
      const next = new Set(state.selectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { selectedIds: next };
    }),

  selectMany: (ids) => set({ selectedIds: new Set(ids) }),

  clearSelection: () => set({ selectedIds: new Set() }),

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

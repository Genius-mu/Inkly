/**
 * Inkly — global state
 *
 * Single source of truth for: strokes on the canvas, undo/redo
 * stacks, and the current tool/color/size selection.
 *
 * Why Zustand and not Redux/Context? It's ~1KB, has no boilerplate,
 * and `useStore(s => s.strokes)` is all the API you need to know.
 */

import { create } from "zustand";
import type { Stroke } from "../types";

interface InklyState {
  // Drawing state
  strokes: Stroke[];
  /** Locally-undone strokes, ready to be redone. */
  redoStack: Stroke[];

  // Tool state
  color: string;
  size: number;
  tool: "pen" | "eraser";

  // Drawing actions
  addStroke: (stroke: Stroke) => void;
  undo: () => void;
  redo: () => void;
  clearAll: () => void;

  // Tool actions
  setColor: (color: string) => void;
  setSize: (size: number) => void;
  setTool: (tool: "pen" | "eraser") => void;
}

export const useStore = create<InklyState>((set, get) => ({
  // ─── initial state ──────────────────────────────────────────
  strokes: [],
  redoStack: [],

  color: "#1a1a1a",
  size: 4,
  tool: "pen",

  // ─── drawing actions ────────────────────────────────────────
  addStroke: (stroke) =>
    set((state) => ({
      strokes: [...state.strokes, stroke],
      // A new action invalidates the redo stack — same as any editor.
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

  // ─── tool actions ───────────────────────────────────────────
  setColor: (color) => set({ color, tool: "pen" }),
  setSize: (size) => set({ size }),
  setTool: (tool) => set({ tool }),
}));

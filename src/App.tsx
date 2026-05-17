import { useCallback, useEffect, useRef, useState } from "react";
import { Header } from "./components/Header";
import { Toolbar } from "./components/Toolbar";
import { Shortcuts } from "./components/Shortcuts";
import { ZoomControls } from "./components/ZoomControls";
import { useStore, type Tool } from "./lib/store";
import { exportCanvasAsPNG, renderScene, setupCanvas } from "./lib/drawing";
import { uid } from "./lib/utils";
import type { Drawable, Point, Shape, Stroke } from "./types";

const BUTTON_LEFT = 0;
const BUTTON_MIDDLE = 1;
const BUTTON_RIGHT = 2;

const SHAPE_VARIANTS: Record<string, Shape["variant"] | null> = {
  rect: "rect",
  ellipse: "ellipse",
  line: "line",
  arrow: "arrow",
};

function isShapeTool(
  tool: Tool,
): tool is "rect" | "ellipse" | "line" | "arrow" {
  return (
    tool === "rect" || tool === "ellipse" || tool === "line" || tool === "arrow"
  );
}

function pinchMetrics(a: Point, b: Point) {
  const midX = (a.x + b.x) / 2;
  const midY = (a.y + b.y) / 2;
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const distance = Math.hypot(dx, dy);
  return { midX, midY, distance };
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  /**
   * The drawable currently being authored — stroke or shape.
   * Null when not drawing.
   */
  const inProgressRef = useRef<Drawable | null>(null);

  const panningRef = useRef(false);
  const isSpaceHeldRef = useRef(false);
  const lastPanPosRef = useRef<Point | null>(null);
  const [cursorMode, setCursorMode] = useState<"draw" | "grab" | "grabbing">(
    "draw",
  );

  const touchesRef = useRef(new Map<number, Point>());
  const pinchStateRef = useRef<{
    midX: number;
    midY: number;
    distance: number;
  } | null>(null);

  const drawables = useStore((s) => s.drawables);
  const view = useStore((s) => s.view);
  const editingId = useStore((s) => s.editingId);
  const addDrawable = useStore((s) => s.addDrawable);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const clearAll = useStore((s) => s.clearAll);
  const panBy = useStore((s) => s.panBy);
  const zoomAt = useStore((s) => s.zoomAt);

  const [confirmingClear, setConfirmingClear] = useState(false);

  /* ───────── canvas lifecycle ───────── */

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleResize = () => {
      ctxRef.current = setupCanvas(canvas);
      if (ctxRef.current) {
        const { drawables: d, view: v, editingId: e } = useStore.getState();
        renderScene(ctxRef.current, d, v, e);
      }
    };
    handleResize();

    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleResize);
    };
  }, []);

  // Re-render whenever drawables, view, or editingId change.
  useEffect(() => {
    if (ctxRef.current) renderScene(ctxRef.current, drawables, view, editingId);
  }, [drawables, view, editingId]);

  /* ───────── wheel + contextmenu (desktop) ───────── */

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const factor = Math.exp(-e.deltaY * 0.0015);
      zoomAt(factor, x, y);
    };

    const onContextMenu = (e: MouseEvent) => e.preventDefault();

    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("contextmenu", onContextMenu);
    return () => {
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("contextmenu", onContextMenu);
    };
  }, [zoomAt]);

  /* ───────── spacebar tracking ───────── */

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && !isTyping(e.target)) {
        e.preventDefault();
        if (!isSpaceHeldRef.current) {
          isSpaceHeldRef.current = true;
          if (!panningRef.current) setCursorMode("grab");
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        isSpaceHeldRef.current = false;
        if (!panningRef.current) setCursorMode("draw");
      }
    };
    const onBlur = () => {
      isSpaceHeldRef.current = false;
      if (!panningRef.current) setCursorMode("draw");
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  /* ───────── pointer events ───────── */

  const pointerPos = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const shouldPan = (e: React.PointerEvent<HTMLCanvasElement>): boolean => {
    return (
      isSpaceHeldRef.current ||
      e.button === BUTTON_MIDDLE ||
      e.button === BUTTON_RIGHT
    );
  };

  const abandonInProgress = () => {
    inProgressRef.current = null;
    if (ctxRef.current) {
      const { drawables: d, view: v, editingId: e } = useStore.getState();
      renderScene(ctxRef.current, d, v, e);
    }
  };

  const screenToWorld = (p: Point): Point => {
    const v = useStore.getState().view;
    return {
      x: (p.x - v.panX) / v.zoom,
      y: (p.y - v.panY) / v.zoom,
    };
  };

  /** Build a new drawable based on the active tool. */
  const beginDrawable = (worldStart: Point): Drawable | null => {
    const { color, size, tool } = useStore.getState();

    if (tool === "pen" || tool === "eraser") {
      const s: Stroke = {
        id: uid(),
        kind: "stroke",
        userId: "local",
        tool,
        color,
        size,
        points: [worldStart],
        createdAt: Date.now(),
      };
      return s;
    }

    if (isShapeTool(tool)) {
      const variant = SHAPE_VARIANTS[tool]!;
      const s: Shape = {
        id: uid(),
        kind: "shape",
        userId: "local",
        variant,
        start: worldStart,
        end: worldStart,
        color,
        size,
        createdAt: Date.now(),
      };
      return s;
    }

    // Text and sticky tools route through a different code path
    // (added in Step 29c-ii).
    return null;
  };

  const updateInProgress = (worldPoint: Point) => {
    const d = inProgressRef.current;
    if (!d) return;

    if (d.kind === "stroke") {
      d.points.push(worldPoint);
    } else if (d.kind === "shape") {
      d.end = worldPoint;
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const screenPoint = pointerPos(e);
    e.currentTarget.setPointerCapture(e.pointerId);

    if (e.pointerType === "touch") {
      touchesRef.current.set(e.pointerId, screenPoint);
      if (touchesRef.current.size >= 2) {
        abandonInProgress();
        const [a, b] = Array.from(touchesRef.current.values());
        pinchStateRef.current = pinchMetrics(a, b);
        return;
      }
    } else {
      if (shouldPan(e)) {
        panningRef.current = true;
        lastPanPosRef.current = screenPoint;
        setCursorMode("grabbing");
        return;
      }
      if (e.button !== BUTTON_LEFT) return;
    }

    const worldPoint = screenToWorld(screenPoint);
    const drawable = beginDrawable(worldPoint);
    if (!drawable) return;

    inProgressRef.current = drawable;
    if (ctxRef.current) {
      renderScene(
        ctxRef.current,
        [...useStore.getState().drawables, drawable],
        useStore.getState().view,
        useStore.getState().editingId,
      );
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const screenPoint = pointerPos(e);

    if (e.pointerType === "touch" && touchesRef.current.has(e.pointerId)) {
      touchesRef.current.set(e.pointerId, screenPoint);
    }

    if (e.pointerType === "touch" && touchesRef.current.size >= 2) {
      const [a, b] = Array.from(touchesRef.current.values());
      const next = pinchMetrics(a, b);
      const prev = pinchStateRef.current;
      if (prev) {
        const dx = next.midX - prev.midX;
        const dy = next.midY - prev.midY;
        if (dx !== 0 || dy !== 0) panBy(dx, dy);
        if (prev.distance > 0 && next.distance > 0) {
          const factor = next.distance / prev.distance;
          if (factor !== 1) zoomAt(factor, next.midX, next.midY);
        }
      }
      pinchStateRef.current = next;
      return;
    }

    if (panningRef.current && lastPanPosRef.current) {
      const dx = screenPoint.x - lastPanPosRef.current.x;
      const dy = screenPoint.y - lastPanPosRef.current.y;
      lastPanPosRef.current = screenPoint;
      panBy(dx, dy);
      return;
    }

    const inProgress = inProgressRef.current;
    if (!inProgress || !ctxRef.current) return;

    const worldPoint = screenToWorld(screenPoint);
    updateInProgress(worldPoint);
    renderScene(
      ctxRef.current,
      [...useStore.getState().drawables, inProgress],
      useStore.getState().view,
      useStore.getState().editingId,
    );
  };

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* may already be released */
      }

      if (e.pointerType === "touch") {
        touchesRef.current.delete(e.pointerId);
        if (touchesRef.current.size < 2) {
          pinchStateRef.current = null;
        }
        if (touchesRef.current.size >= 1) {
          inProgressRef.current = null;
          return;
        }
      }

      if (panningRef.current) {
        panningRef.current = false;
        lastPanPosRef.current = null;
        setCursorMode(isSpaceHeldRef.current ? "grab" : "draw");
        return;
      }

      const inProgress = inProgressRef.current;
      inProgressRef.current = null;
      if (!inProgress) return;

      // Drop degenerate (zero-size) shapes from stray clicks.
      if (inProgress.kind === "shape") {
        const dx = inProgress.end.x - inProgress.start.x;
        const dy = inProgress.end.y - inProgress.start.y;
        if (Math.hypot(dx, dy) < 2) return;
      }

      addDrawable(inProgress);
    },
    [addDrawable],
  );

  /* ───────── export ───────── */

  const handleExport = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    exportCanvasAsPNG(canvas, `inkly-${stamp}.png`);
  }, []);

  /* ───────── keyboard shortcuts ───────── */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setConfirmingClear(false);
        return;
      }
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (!meta && !isTyping(e.target)) {
        const k = e.key.toLowerCase();
        if (k === "p") useStore.getState().setTool("pen");
        else if (k === "e") useStore.getState().setTool("eraser");
        else if (k === "r") useStore.getState().setTool("rect");
        else if (k === "o") useStore.getState().setTool("ellipse");
        else if (k === "l") useStore.getState().setTool("line");
        else if (k === "a") useStore.getState().setTool("arrow");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [redo, undo]);

  /* ───────── render ───────── */

  const cursorClass =
    cursorMode === "grabbing"
      ? "cursor-grabbing"
      : cursorMode === "grab"
        ? "cursor-grab"
        : "cursor-crosshair";

  return (
    <div className="grid h-dvh grid-rows-[auto_1fr] overflow-hidden bg-white">
      <Header />

      <main className="relative overflow-hidden bg-neutral-50">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(circle, #d4d4d4 1px, transparent 1px)",
            backgroundSize: "24px 24px",
            backgroundPosition: "0 0",
            maskImage:
              "radial-gradient(ellipse at center, black 40%, transparent 90%)",
            WebkitMaskImage:
              "radial-gradient(ellipse at center, black 40%, transparent 90%)",
          }}
        />

        <canvas
          ref={canvasRef}
          className={`absolute inset-0 block h-full w-full touch-none ${cursorClass}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />

        {drawables.length === 0 && (
          <div className="pointer-events-none absolute inset-0 grid animate-fade-in place-items-center">
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-8px_rgba(0,0,0,0.12)]">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  className="h-5 w-5 text-neutral-400"
                >
                  <path
                    d="M3 21l3.6-1 11-11-2.6-2.6-11 11L3 21z"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M14 7l3-3 2.6 2.6-3 3"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-neutral-700">
                  Start drawing
                </p>
                <p className="mt-0.5 font-mono text-[11px] text-neutral-400">
                  Single finger to draw — two fingers to pan and zoom
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="safe-bottom pointer-events-none absolute inset-x-0 bottom-0 flex justify-center px-3 pb-6">
          <Toolbar
            onUndo={undo}
            onRedo={redo}
            onClear={() => setConfirmingClear(true)}
            onExport={handleExport}
          />
        </div>

        <ZoomControls canvasRef={canvasRef} />
        <Shortcuts />

        {confirmingClear && (
          <div
            className="absolute inset-0 z-50 grid animate-fade-in place-items-center bg-neutral-900/30 px-4 backdrop-blur-sm"
            onClick={() => setConfirmingClear(false)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
          >
            <div
              className="w-[min(380px,calc(100%-1rem))] rounded-2xl bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_24px_60px_-20px_rgba(0,0,0,0.4)]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 grid h-10 w-10 place-items-center rounded-xl bg-red-50">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  className="h-5 w-5 text-red-600"
                >
                  <path
                    d="M12 9v4M12 17h.01M10.3 3.86l-8.49 14.14A2 2 0 003.51 21h16.98a2 2 0 001.71-3l-8.49-14.14a2 2 0 00-3.41 0z"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>

              <h3
                id="confirm-title"
                className="text-lg font-semibold tracking-tight text-neutral-900"
              >
                Clear the canvas?
              </h3>
              <p className="mt-1 text-sm text-neutral-500">
                All {drawables.length} item{drawables.length === 1 ? "" : "s"}{" "}
                will be removed. This can't be undone.
              </p>

              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmingClear(false)}
                  className="rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
                >
                  Keep drawing
                </button>
                <button
                  type="button"
                  onClick={() => {
                    clearAll();
                    setConfirmingClear(false);
                  }}
                  className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600"
                  autoFocus
                >
                  Clear it
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}

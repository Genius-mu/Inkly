import { useCallback, useEffect, useRef, useState } from "react";
import { Header } from "./components/Header";
import { Toolbar } from "./components/Toolbar";
import { Shortcuts } from "./components/Shortcuts";
import { useStore } from "./lib/store";
import { ZoomControls } from "./components/ZoomControls";
import { exportCanvasAsPNG, renderScene, setupCanvas } from "./lib/drawing";
import { uid } from "./lib/utils";
import type { Point, Stroke } from "./types";

/** Mouse button codes for `event.button`. */
const BUTTON_LEFT = 0;
const BUTTON_MIDDLE = 1;
const BUTTON_RIGHT = 2;

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const drawingStrokeRef = useRef<Stroke | null>(null);

  /** True while the user is actively panning (pointer captured). */
  const panningRef = useRef(false);
  /** True while spacebar is held — the user could pan if they press down. */
  const isSpaceHeldRef = useRef(false);
  /** Last pointer position during a pan, used to compute deltas. */
  const lastPanPosRef = useRef<Point | null>(null);
  /** Cursor state for the canvas — kept as React state so Tailwind updates. */
  const [cursorMode, setCursorMode] = useState<"draw" | "grab" | "grabbing">(
    "draw",
  );

  const strokes = useStore((s) => s.strokes);
  const view = useStore((s) => s.view);
  const addStroke = useStore((s) => s.addStroke);
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
        const { strokes: s, view: v } = useStore.getState();
        renderScene(ctxRef.current, s, v);
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

  // Re-render whenever strokes OR view change.
  useEffect(() => {
    if (ctxRef.current) renderScene(ctxRef.current, strokes, view);
  }, [strokes, view]);

  /* ───────── pan & zoom: wheel and contextmenu ───────── */

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Cmd/Ctrl + scroll → zoom toward cursor.
    // We use a native non-passive listener so we can preventDefault
    // (React's onWheel is passive by default and can't block page scroll).
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      // Smooth, exponential zoom — natural feel across trackpads and mice.
      // deltaY > 0 means scroll down → zoom out.
      const factor = Math.exp(-e.deltaY * 0.0015);
      zoomAt(factor, x, y);
    };

    // Block the browser context menu so right-click can pan.
    const onContextMenu = (e: MouseEvent) => e.preventDefault();

    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("contextmenu", onContextMenu);
    return () => {
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("contextmenu", onContextMenu);
    };
  }, [zoomAt]);

  /* ───────── pan & zoom: spacebar tracking ───────── */

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Don't trigger spacebar pan if user is typing in an input.
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
    // If the window loses focus while space is held, release it.
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

  /** Should this pointer-down begin a pan instead of a draw? */
  const shouldPan = (e: React.PointerEvent<HTMLCanvasElement>): boolean => {
    return (
      isSpaceHeldRef.current ||
      e.button === BUTTON_MIDDLE ||
      e.button === BUTTON_RIGHT
    );
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const screenPoint = pointerPos(e);

    if (shouldPan(e)) {
      panningRef.current = true;
      lastPanPosRef.current = screenPoint;
      setCursorMode("grabbing");
      return;
    }

    // Only left button starts a draw.
    if (e.button !== BUTTON_LEFT) return;

    const { color, size, tool, view: v } = useStore.getState();
    const worldPoint: Point = {
      x: (screenPoint.x - v.panX) / v.zoom,
      y: (screenPoint.y - v.panY) / v.zoom,
    };
    drawingStrokeRef.current = {
      id: uid(),
      userId: "local",
      tool,
      color,
      size,
      points: [worldPoint],
      createdAt: Date.now(),
    };
    if (ctxRef.current) {
      renderScene(
        ctxRef.current,
        [...useStore.getState().strokes, drawingStrokeRef.current],
        v,
      );
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const screenPoint = pointerPos(e);

    // Panning has priority — if we're in a pan, ignore stroke logic.
    if (panningRef.current && lastPanPosRef.current) {
      const dx = screenPoint.x - lastPanPosRef.current.x;
      const dy = screenPoint.y - lastPanPosRef.current.y;
      lastPanPosRef.current = screenPoint;
      panBy(dx, dy);
      return;
    }

    const stroke = drawingStrokeRef.current;
    if (!stroke || !ctxRef.current) return;

    const v = useStore.getState().view;
    const worldPoint: Point = {
      x: (screenPoint.x - v.panX) / v.zoom,
      y: (screenPoint.y - v.panY) / v.zoom,
    };
    stroke.points.push(worldPoint);
    renderScene(ctxRef.current, [...useStore.getState().strokes, stroke], v);
  };

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* may already be released */
      }

      // End of pan?
      if (panningRef.current) {
        panningRef.current = false;
        lastPanPosRef.current = null;
        setCursorMode(isSpaceHeldRef.current ? "grab" : "draw");
        return;
      }

      // End of stroke.
      const stroke = drawingStrokeRef.current;
      drawingStrokeRef.current = null;
      if (!stroke) return;
      addStroke(stroke);
    },
    [addStroke],
  );

  /* ───────── export ───────── */

  const handleExport = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    exportCanvasAsPNG(canvas, `inkly-${stamp}.png`);
  }, []);

  /* ───────── keyboard shortcuts (existing) ───────── */

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
      } else if (e.key.toLowerCase() === "e" && !meta && !isTyping(e.target)) {
        useStore.getState().setTool("eraser");
      } else if (e.key.toLowerCase() === "p" && !meta && !isTyping(e.target)) {
        useStore.getState().setTool("pen");
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
        {/* dot grid background */}
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

        {strokes.length === 0 && (
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
                  Click and drag — hold space to pan, ⌘/Ctrl + scroll to zoom
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
                All {strokes.length} stroke{strokes.length === 1 ? "" : "s"}{" "}
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

/** Don't trigger keyboard shortcuts while the user is typing in an input. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}


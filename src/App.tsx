import { useCallback, useEffect, useRef, useState } from "react";
import { Header } from "./components/Header";
import { Toolbar } from "./components/Toolbar";
import { Shortcuts } from "./components/Shortcuts";
import { useStore } from "./lib/store";
import {
  drawStroke,
  exportCanvasAsPNG,
  renderScene,
  setupCanvas,
} from "./lib/drawing";
import { uid } from "./lib/utils";
import type { Point, Stroke } from "./types";

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  /** The stroke currently being drawn — null when not drawing. */
  const drawingStrokeRef = useRef<Stroke | null>(null);

  const strokes = useStore((s) => s.strokes);
  const addStroke = useStore((s) => s.addStroke);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const clearAll = useStore((s) => s.clearAll);

  const [confirmingClear, setConfirmingClear] = useState(false);

  /* ───────── canvas lifecycle ───────── */

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleResize = () => {
      ctxRef.current = setupCanvas(canvas);
      if (ctxRef.current)
        renderScene(ctxRef.current, useStore.getState().strokes);
    };
    handleResize();

    window.addEventListener("resize", handleResize);
    // On mobile Safari, the URL bar showing/hiding fires `resize` —
    // useful for us, the same handler does the right thing.
    window.addEventListener("orientationchange", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleResize);
    };
  }, []);

  useEffect(() => {
    if (ctxRef.current) renderScene(ctxRef.current, strokes);
  }, [strokes]);

  /* ───────── pointer events ───────── */

  const pointerPos = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const { color, size, tool } = useStore.getState();
    const point = pointerPos(e);
    drawingStrokeRef.current = {
      id: uid(),
      userId: "local",
      tool,
      color,
      size,
      points: [point],
      createdAt: Date.now(),
    };
    if (ctxRef.current) drawStroke(ctxRef.current, drawingStrokeRef.current);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const stroke = drawingStrokeRef.current;
    if (!stroke || !ctxRef.current) return;

    const point = pointerPos(e);
    stroke.points.push(point);

    if (stroke.points.length >= 2) {
      const a = stroke.points[stroke.points.length - 2];
      const b = stroke.points[stroke.points.length - 1];
      const ctx = ctxRef.current;
      ctx.save();
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.size;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.globalCompositeOperation =
        stroke.tool === "eraser" ? "destination-out" : "source-over";
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.restore();
    }
  };

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* may already be released */
      }
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
      } else if (e.key.toLowerCase() === "e" && !meta) {
        useStore.getState().setTool("eraser");
      } else if (e.key.toLowerCase() === "p" && !meta) {
        useStore.getState().setTool("pen");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [redo, undo]);

  /* ───────── render ───────── */

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

        {/* drawing surface */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 block h-full w-full cursor-crosshair touch-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />

        {/* empty state */}
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
                  Click and drag anywhere on the canvas
                </p>
              </div>
            </div>
          </div>
        )}

        {/* floating toolbar */}
        <div className="safe-bottom pointer-events-none absolute inset-x-0 bottom-0 flex justify-center px-3 pb-6">
          <Toolbar
            onUndo={undo}
            onRedo={redo}
            onClear={() => setConfirmingClear(true)}
            onExport={handleExport}
          />
        </div>

        {/* shortcuts trigger + popover */}
        <Shortcuts />

        {/* clear confirmation dialog */}
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

import { useCallback, useEffect, useRef } from "react";
import { Header } from "./components/Header";
import { Toolbar } from "./components/Toolbar";
import { useStore } from "./lib/store";
import { drawStroke, renderScene, setupCanvas } from "./lib/drawing";
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

  /* ───────── canvas lifecycle ───────── */

  // Set up canvas on mount + handle window resize.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleResize = () => {
      ctxRef.current = setupCanvas(canvas);
      // Re-render the scene — resize wipes the bitmap.
      if (ctxRef.current)
        renderScene(ctxRef.current, useStore.getState().strokes);
    };
    handleResize();

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Re-render whenever strokes change (added, undone, redone, cleared).
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
    // Render the first dot immediately for tap-feel.
    if (ctxRef.current) drawStroke(ctxRef.current, drawingStrokeRef.current);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const stroke = drawingStrokeRef.current;
    if (!stroke || !ctxRef.current) return;

    const point = pointerPos(e);
    stroke.points.push(point);

    // Draw just the new segment for smoothness while drawing.
    // (The full smoothed version replaces this on pointerup.)
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
      // Commit the stroke to the store. Triggers a full re-render
      // through the useEffect above, replacing the live segments
      // with the smoothed version.
      addStroke(stroke);
    },
    [addStroke],
  );

  /* ───────── keyboard shortcuts ───────── */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (e.key.toLowerCase() === "e" && !meta) {
        const t = useStore.getState().tool;
        useStore.getState().setTool(t === "eraser" ? "pen" : "eraser");
      } else if (e.key.toLowerCase() === "p" && !meta) {
        useStore.getState().setTool("pen");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [redo, undo]);

  /* ───────── render ───────── */

  return (
    <div className="grid h-screen grid-rows-[auto_1fr] overflow-hidden bg-white">
      <Header />

      <main className="relative overflow-hidden bg-neutral-50">
        {/* dot grid background — purely decorative, sits behind the canvas */}
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

        {/* empty state — visible only when no strokes exist */}
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
        <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center">
          <Toolbar onUndo={undo} onRedo={redo} onClear={clearAll} />
        </div>
      </main>
    </div>
  );
}

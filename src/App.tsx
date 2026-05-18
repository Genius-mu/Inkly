import { useCallback, useEffect, useRef, useState } from "react";
import { Header } from "./components/Header";
import { Toolbar } from "./components/Toolbar";
import { Shortcuts } from "./components/Shortcuts";
import { ZoomControls } from "./components/ZoomControls";
import { TextEditor } from "./components/TextEditor";
import { AuthModal } from "./components/AuthModal";
import { useStore, type Tool } from "./lib/store";
import { useAuth } from "./lib/useAuth";
import {
  exportCanvasAsPNG,
  hitTestAny,
  hitTestEditable,
  hitTestSelection,
  renderScene,
  setupCanvas,
} from "./lib/drawing";
import { uid } from "./lib/utils";
import type {
  Drawable,
  Point,
  Shape,
  StickyNote,
  Stroke,
  TextItem,
} from "./types";

const BUTTON_LEFT = 0;
const BUTTON_MIDDLE = 1;
const BUTTON_RIGHT = 2;

const SHAPE_VARIANTS: Record<string, Shape["variant"] | null> = {
  rect: "rect",
  ellipse: "ellipse",
  line: "line",
  arrow: "arrow",
};

const DEFAULT_TEXT_SIZE = 18;

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
  useAuth();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
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
  const tool = useStore((s) => s.tool);
  const user = useStore((s) => s.user);
  const authReady = useStore((s) => s.authReady);
  const selectedIds = useStore((s) => s.selectedIds);
  const addDrawable = useStore((s) => s.addDrawable);
  const removeDrawable = useStore((s) => s.removeDrawable);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const clearAll = useStore((s) => s.clearAll);
  const panBy = useStore((s) => s.panBy);
  const zoomAt = useStore((s) => s.zoomAt);
  const startEditing = useStore((s) => s.startEditing);
  const selectOne = useStore((s) => s.selectOne);
  const clearSelection = useStore((s) => s.clearSelection);

  const [confirmingClear, setConfirmingClear] = useState(false);

  const currentUserId = user?.id ?? "local";

  /* ───────── canvas lifecycle ───────── */

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleResize = () => {
      ctxRef.current = setupCanvas(canvas);
      if (ctxRef.current) {
        const s = useStore.getState();
        renderScene(
          ctxRef.current,
          s.drawables,
          s.view,
          s.editingId,
          s.selectedIds,
        );
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

  useEffect(() => {
    if (ctxRef.current) {
      renderScene(ctxRef.current, drawables, view, editingId, selectedIds);
    }
  }, [drawables, view, editingId, selectedIds]);

  /* ───────── wheel + contextmenu ───────── */

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
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
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
      const s = useStore.getState();
      renderScene(
        ctxRef.current,
        s.drawables,
        s.view,
        s.editingId,
        s.selectedIds,
      );
    }
  };

  const screenToWorld = (p: Point): Point => {
    const v = useStore.getState().view;
    return { x: (p.x - v.panX) / v.zoom, y: (p.y - v.panY) / v.zoom };
  };

  const spawnText = (worldPoint: Point) => {
    const { color } = useStore.getState();
    const t: TextItem = {
      id: uid(),
      kind: "text",
      userId: currentUserId,
      position: worldPoint,
      text: "",
      color,
      fontSize: DEFAULT_TEXT_SIZE,
      createdAt: Date.now(),
    };
    addDrawable(t);
    startEditing(t.id);
  };

  const spawnSticky = (worldPoint: Point) => {
    const { stickyColor } = useStore.getState();
    const STICKY_W = 240;
    const STICKY_H = 180;
    const n: StickyNote = {
      id: uid(),
      kind: "sticky",
      userId: currentUserId,
      position: {
        x: worldPoint.x - STICKY_W / 2,
        y: worldPoint.y - STICKY_H / 2,
      },
      text: "",
      background: stickyColor,
      createdAt: Date.now(),
    };
    addDrawable(n);
    startEditing(n.id);
  };

  const eraseAt = (worldPoint: Point) => {
    const { drawables: d } = useStore.getState();
    const hit = hitTestAny(worldPoint, d, 4);
    if (hit) removeDrawable(hit.id);
  };

  /** Click handler for the select tool. */
  const handleSelectClick = (worldPoint: Point) => {
    const { drawables: d } = useStore.getState();
    const hit = hitTestSelection(worldPoint, d);
    if (hit) {
      selectOne(hit.id);
    } else {
      clearSelection();
    }
  };

  const beginDrawable = (worldStart: Point): Drawable | null => {
    const { color, size, tool: t } = useStore.getState();

    if (t === "pen" || t === "eraser") {
      const s: Stroke = {
        id: uid(),
        kind: "stroke",
        userId: currentUserId,
        tool: t,
        color,
        size,
        points: [worldStart],
        createdAt: Date.now(),
      };
      return s;
    }

    if (isShapeTool(t)) {
      const variant = SHAPE_VARIANTS[t]!;
      const s: Shape = {
        id: uid(),
        kind: "shape",
        userId: currentUserId,
        variant,
        start: worldStart,
        end: worldStart,
        color,
        size,
        createdAt: Date.now(),
      };
      return s;
    }

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
    if (useStore.getState().editingId) return;

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
    const { tool: t } = useStore.getState();

    // Select tool: hit-test and select. No in-progress drawable.
    if (t === "select") {
      handleSelectClick(worldPoint);
      return;
    }

    if (t === "text") {
      spawnText(worldPoint);
      return;
    }
    if (t === "sticky") {
      spawnSticky(worldPoint);
      return;
    }
    if (t === "object-eraser") {
      eraseAt(worldPoint);
      return;
    }

    const drawable = beginDrawable(worldPoint);
    if (!drawable) return;

    inProgressRef.current = drawable;
    if (ctxRef.current) {
      const s = useStore.getState();
      renderScene(
        ctxRef.current,
        [...s.drawables, drawable],
        s.view,
        s.editingId,
        s.selectedIds,
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

    if (useStore.getState().tool === "object-eraser" && e.buttons === 1) {
      const worldPoint = screenToWorld(screenPoint);
      eraseAt(worldPoint);
      return;
    }

    const inProgress = inProgressRef.current;
    if (!inProgress || !ctxRef.current) return;

    const worldPoint = screenToWorld(screenPoint);
    updateInProgress(worldPoint);
    const s = useStore.getState();
    renderScene(
      ctxRef.current,
      [...s.drawables, inProgress],
      s.view,
      s.editingId,
      s.selectedIds,
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
        if (touchesRef.current.size < 2) pinchStateRef.current = null;
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

      if (inProgress.kind === "shape") {
        const dx = inProgress.end.x - inProgress.start.x;
        const dy = inProgress.end.y - inProgress.start.y;
        if (Math.hypot(dx, dy) < 2) return;
      }

      addDrawable(inProgress);
    },
    [addDrawable],
  );

  const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const screen: Point = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const world = screenToWorld(screen);
    const hit = hitTestEditable(world, useStore.getState().drawables);
    if (hit && (hit.kind === "text" || hit.kind === "sticky")) {
      startEditing(hit.id);
    }
  };

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
        useStore.getState().clearSelection();
        return;
      }
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (!meta && !isTyping(e.target)) {
        const k = e.key.toLowerCase();
        if (k === "v") useStore.getState().setTool("select");
        else if (k === "p") useStore.getState().setTool("pen");
        else if (k === "e") useStore.getState().setTool("eraser");
        else if (k === "x") useStore.getState().setTool("object-eraser");
        else if (k === "r") useStore.getState().setTool("rect");
        else if (k === "o") useStore.getState().setTool("ellipse");
        else if (k === "l") useStore.getState().setTool("line");
        else if (k === "a") useStore.getState().setTool("arrow");
        else if (k === "t") useStore.getState().setTool("text");
        else if (k === "s") useStore.getState().setTool("sticky");
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
        : tool === "select"
          ? "cursor-default"
          : tool === "text" || tool === "sticky"
            ? "cursor-text"
            : tool === "object-eraser"
              ? "cursor-pointer"
              : "cursor-crosshair";

  const editingDrawable = editingId
    ? drawables.find((d) => d.id === editingId)
    : null;

  const showAuth = authReady && !user;

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
          onDoubleClick={handleDoubleClick}
        />

        {drawables.length === 0 && !showAuth && (
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

        {editingDrawable &&
          (editingDrawable.kind === "text" ||
            editingDrawable.kind === "sticky") && (
            <TextEditor drawable={editingDrawable} />
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

        {showAuth && <AuthModal />}

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

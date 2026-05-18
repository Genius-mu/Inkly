import clsx from "clsx";
import { useEffect, useRef, useState } from "react";
import { useStore, type Tool } from "../lib/store";
import type { StickyColor } from "../types";

const PALETTE = [
  "#0a0a0a", // ink
  "#2563eb", // signal blue
  "#dc2626", // red
  "#16a34a", // green
  "#ca8a04", // amber
  "#9333ea", // purple
];

const SIZES = [2, 4, 8, 16];

const SHAPE_TOOLS: Array<{
  tool: Tool;
  label: string;
  icon: () => React.ReactElement;
}> = [
  { tool: "rect", label: "Rectangle", icon: () => <RectIcon /> },
  { tool: "ellipse", label: "Ellipse", icon: () => <EllipseIcon /> },
  { tool: "line", label: "Line", icon: () => <LineIcon /> },
  { tool: "arrow", label: "Arrow", icon: () => <ArrowIcon /> },
];

/** Sticky note color presets — kept in sync with drawing.ts. */
const STICKY_COLORS: Array<{ color: StickyColor; swatch: string }> = [
  { color: "yellow", swatch: "#fef9c3" },
  { color: "pink", swatch: "#fce7f3" },
  { color: "blue", swatch: "#dbeafe" },
  { color: "green", swatch: "#dcfce7" },
];

interface ToolbarProps {
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onExport: () => void;
}

export function Toolbar({ onUndo, onRedo, onClear, onExport }: ToolbarProps) {
  const color = useStore((s) => s.color);
  const setColor = useStore((s) => s.setColor);
  const size = useStore((s) => s.size);
  const setSize = useStore((s) => s.setSize);
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);
  const stickyColor = useStore((s) => s.stickyColor);
  const setStickyColor = useStore((s) => s.setStickyColor);
  const drawables = useStore((s) => s.drawables);
  const redoStack = useStore((s) => s.redoStack);

  const canUndo = drawables.length > 0;
  const canRedo = redoStack.length > 0;

  const [shapeMenuOpen, setShapeMenuOpen] = useState(false);
  const shapeButtonRef = useRef<HTMLButtonElement>(null);
  const shapePopoverRef = useRef<HTMLDivElement>(null);
  const [shapeAnchor, setShapeAnchor] = useState<{
    left: number;
    top: number;
  } | null>(null);

  /* Reposition the shape popover whenever it opens or the window resizes. */
  useEffect(() => {
    if (!shapeMenuOpen) return;

    const placePopover = () => {
      const btn = shapeButtonRef.current;
      const pop = shapePopoverRef.current;
      if (!btn || !pop) return;
      const buttonRect = btn.getBoundingClientRect();
      const popRect = pop.getBoundingClientRect();
      const left = buttonRect.left + buttonRect.width / 2 - popRect.width / 2;
      const top = buttonRect.top - popRect.height - 8;
      setShapeAnchor({
        left: Math.max(
          8,
          Math.min(left, window.innerWidth - popRect.width - 8),
        ),
        top: Math.max(8, top),
      });
    };

    placePopover();
    const raf = requestAnimationFrame(placePopover);

    window.addEventListener("resize", placePopover);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", placePopover);
    };
  }, [shapeMenuOpen]);

  /* Click outside closes the shape popover. */
  useEffect(() => {
    if (!shapeMenuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (
        shapeButtonRef.current?.contains(t) ||
        shapePopoverRef.current?.contains(t)
      ) {
        return;
      }
      setShapeMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [shapeMenuOpen]);

  const isShapeTool =
    tool === "rect" ||
    tool === "ellipse" ||
    tool === "line" ||
    tool === "arrow";

  const activeShape =
    SHAPE_TOOLS.find((s) => s.tool === tool) ?? SHAPE_TOOLS[0];

  return (
    <>
      <div
        role="toolbar"
        aria-label="Drawing tools"
        className="
          no-scrollbar pointer-events-auto flex max-w-[calc(100vw-1.5rem)] items-center gap-1
          overflow-x-auto rounded-2xl border border-neutral-200 bg-white p-1.5
          shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-8px_rgba(0,0,0,0.12)]
        "
      >
        {/* ─── pen / pixel-eraser segmented toggle ─── */}
        <div className="flex shrink-0 rounded-xl bg-neutral-100 p-0.5">
          <SegmentButton
            active={tool === "pen"}
            onClick={() => setTool("pen")}
            label="Pen (P)"
          >
            <PenIcon />
          </SegmentButton>
          <SegmentButton
            active={tool === "eraser"}
            onClick={() => setTool("eraser")}
            label="Pixel eraser (E)"
          >
            <EraserIcon />
          </SegmentButton>
        </div>

        {/* ─── object eraser ─── */}
        <ToolButton
          active={tool === "object-eraser"}
          onClick={() => setTool("object-eraser")}
          label="Object eraser (X)"
        >
          <ScissorsIcon />
        </ToolButton>

        <Divider />

        {/* ─── shape button ─── */}
        <button
          ref={shapeButtonRef}
          type="button"
          onClick={() => setShapeMenuOpen((v) => !v)}
          aria-label="Shape tools"
          aria-pressed={isShapeTool}
          aria-expanded={shapeMenuOpen}
          className={clsx(
            "grid h-9 w-9 shrink-0 place-items-center rounded-lg transition-colors",
            isShapeTool
              ? "bg-neutral-900 text-white"
              : "text-neutral-700 hover:bg-neutral-100",
          )}
          title="Shapes"
        >
          {activeShape.icon()}
        </button>

        {/* ─── text button ─── */}
        <ToolButton
          active={tool === "text"}
          onClick={() => setTool("text")}
          label="Text (T)"
        >
          <TextIcon />
        </ToolButton>

        {/* ─── sticky button ─── */}
        <ToolButton
          active={tool === "sticky"}
          onClick={() => setTool("sticky")}
          label="Sticky note (S)"
        >
          <StickyIcon />
        </ToolButton>

        <Divider />

        {/* ─── sticky color picker (only when sticky tool active) ─── */}
        {tool === "sticky" && (
          <>
            <div className="flex shrink-0 items-center gap-1 px-1">
              {STICKY_COLORS.map(({ color: c, swatch }) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setStickyColor(c)}
                  aria-label={`Sticky color ${c}`}
                  aria-pressed={stickyColor === c}
                  className={clsx(
                    "group relative h-7 w-7 shrink-0 rounded-lg transition-transform",
                    "hover:-translate-y-0.5 active:translate-y-0",
                    stickyColor === c &&
                      "ring-2 ring-offset-2 ring-neutral-900",
                  )}
                  title={c}
                >
                  <span
                    className="absolute inset-1 rounded-md border border-black/10"
                    style={{ backgroundColor: swatch }}
                  />
                </button>
              ))}
            </div>
            <Divider />
          </>
        )}

        {/* ─── color palette (hidden when sticky is active — stickies have their own) ─── */}
        {tool !== "sticky" && (
          <>
            <div className="flex shrink-0 items-center gap-1 px-1">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-label={`Color ${c}`}
                  aria-pressed={color === c}
                  className={clsx(
                    "group relative h-7 w-7 shrink-0 rounded-lg transition-transform",
                    "hover:-translate-y-0.5 active:translate-y-0",
                    color === c && "ring-2 ring-offset-2 ring-neutral-900",
                  )}
                >
                  <span
                    className="absolute inset-1 rounded-md"
                    style={{ backgroundColor: c }}
                  />
                </button>
              ))}
            </div>
            <Divider />
          </>
        )}

        {/* ─── sizes (hidden when sticky / text active — they have their own sizing) ─── */}
        {tool !== "sticky" && tool !== "text" && (
          <>
            <div className="flex shrink-0 items-center gap-0.5 px-1">
              {SIZES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSize(s)}
                  aria-label={`Size ${s}`}
                  aria-pressed={size === s}
                  className={clsx(
                    "grid h-9 w-9 shrink-0 place-items-center rounded-lg transition-colors",
                    size === s ? "bg-neutral-900" : "hover:bg-neutral-100",
                  )}
                >
                  <span
                    className={clsx(
                      "block rounded-full transition-colors",
                      size === s ? "bg-white" : "bg-neutral-900",
                    )}
                    style={{
                      width: Math.min(s + 2, 18),
                      height: Math.min(s + 2, 18),
                    }}
                  />
                </button>
              ))}
            </div>
            <Divider />
          </>
        )}

        {/* ─── actions ─── */}
        <div className="flex shrink-0 items-center gap-0.5">
          <IconButton onClick={onUndo} disabled={!canUndo} label="Undo (⌘Z)">
            <UndoIcon />
          </IconButton>
          <IconButton onClick={onRedo} disabled={!canRedo} label="Redo (⇧⌘Z)">
            <RedoIcon />
          </IconButton>
          <IconButton
            onClick={onExport}
            disabled={!canUndo}
            label="Save as PNG"
          >
            <DownloadIcon />
          </IconButton>
          <IconButton onClick={onClear} label="Clear" tone="danger">
            <TrashIcon />
          </IconButton>
        </div>
      </div>

      {/* ─── shape popover (rendered outside the toolbar's overflow) ─── */}
      {shapeMenuOpen && (
        <div
          ref={shapePopoverRef}
          className="
            fixed z-50 flex animate-fade-in items-center gap-0.5
            rounded-xl border border-neutral-200 bg-white p-1
            shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-8px_rgba(0,0,0,0.12)]
          "
          style={{
            left: shapeAnchor?.left ?? -9999,
            top: shapeAnchor?.top ?? -9999,
            visibility: shapeAnchor ? "visible" : "hidden",
          }}
        >
          {SHAPE_TOOLS.map(({ tool: t, label, icon: Icon }) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setTool(t);
                setShapeMenuOpen(false);
              }}
              aria-label={label}
              title={label}
              aria-pressed={tool === t}
              className={clsx(
                "grid h-9 w-9 place-items-center rounded-lg transition-colors",
                tool === t
                  ? "bg-neutral-900 text-white"
                  : "text-neutral-700 hover:bg-neutral-100",
              )}
            >
              <Icon />
            </button>
          ))}
        </div>
      )}
    </>
  );
}

/* ─── primitives ─── */

function Divider() {
  return (
    <span className="mx-0.5 h-6 w-px shrink-0 bg-neutral-200" aria-hidden />
  );
}

function SegmentButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={clsx(
        "grid h-8 w-9 shrink-0 place-items-center rounded-lg transition-all",
        active
          ? "bg-white text-neutral-900 shadow-sm"
          : "text-neutral-500 hover:text-neutral-900",
      )}
    >
      {children}
    </button>
  );
}

function ToolButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={clsx(
        "grid h-9 w-9 shrink-0 place-items-center rounded-lg transition-colors",
        active
          ? "bg-neutral-900 text-white"
          : "text-neutral-700 hover:bg-neutral-100",
      )}
    >
      {children}
    </button>
  );
}

function IconButton({
  onClick,
  disabled,
  label,
  tone = "default",
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  label: string;
  tone?: "default" | "danger";
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={clsx(
        "grid h-9 w-9 shrink-0 place-items-center rounded-lg transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-30",
        tone === "danger"
          ? "text-neutral-500 hover:bg-red-50 hover:text-red-600 disabled:hover:bg-transparent disabled:hover:text-neutral-500"
          : "text-neutral-700 hover:bg-neutral-100 disabled:hover:bg-transparent",
      )}
    >
      {children}
    </button>
  );
}

/* ─── icons ─── */

const iconBase = "h-[18px] w-[18px]";

function PenIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={iconBase}>
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
  );
}

function EraserIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={iconBase}>
      <path
        d="M16 3l5 5-9 9H7l-4-4 9-9 4-1z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9 11l5 5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function RectIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={iconBase}>
      <rect
        x="4"
        y="6"
        width="16"
        height="12"
        stroke="currentColor"
        strokeWidth="1.6"
        rx="1.5"
      />
    </svg>
  );
}

function EllipseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={iconBase}>
      <ellipse
        cx="12"
        cy="12"
        rx="8"
        ry="6"
        stroke="currentColor"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function LineIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={iconBase}>
      <path
        d="M5 19L19 5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={iconBase}>
      <path
        d="M5 19L19 5M19 5h-7M19 5v7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TextIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={iconBase}>
      <path
        d="M4 6V4h16v2M12 4v16M9 20h6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StickyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={iconBase}>
      <path
        d="M5 4h11l4 4v12H5z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16 4v4h4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function UndoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={iconBase}>
      <path
        d="M9 14L4 9l5-5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4 9h11a5 5 0 010 10h-4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function RedoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={iconBase}>
      <path
        d="M15 14l5-5-5-5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M20 9H9a5 5 0 000 10h4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={iconBase}>
      <path
        d="M12 4v12m0 0l-4-4m4 4l4-4M4 20h16"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={iconBase}>
      <path
        d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ScissorsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={iconBase}>
      <circle cx="6" cy="6" r="3" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="6" cy="18" r="3" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M20 4L8.12 15.88M14.47 14.48L20 20M8.12 8.12L12 12"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

import clsx from "clsx";
import { useStore } from "../lib/store";

const PALETTE = [
  "#0a0a0a", // ink
  "#2563eb", // signal blue
  "#dc2626", // red
  "#16a34a", // green
  "#ca8a04", // amber
  "#9333ea", // purple
];

const SIZES = [2, 4, 8, 16];

interface ToolbarProps {
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
}

export function Toolbar({ onUndo, onRedo, onClear }: ToolbarProps) {
  const color = useStore((s) => s.color);
  const setColor = useStore((s) => s.setColor);
  const size = useStore((s) => s.size);
  const setSize = useStore((s) => s.setSize);
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);
  const strokes = useStore((s) => s.strokes);
  const redoStack = useStore((s) => s.redoStack);

  const canUndo = strokes.length > 0;
  const canRedo = redoStack.length > 0;

  return (
    <div
      role="toolbar"
      aria-label="Drawing tools"
      className="
        pointer-events-auto flex items-center gap-1
        rounded-2xl border border-neutral-200 bg-white p-1.5
        shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-8px_rgba(0,0,0,0.12)]
      "
    >
      {/* ─── pen / eraser segmented toggle ─── */}
      <div className="flex rounded-xl bg-neutral-100 p-0.5">
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
          label="Eraser (E)"
        >
          <EraserIcon />
        </SegmentButton>
      </div>

      <Divider />

      {/* ─── color palette ─── */}
      <div className="flex items-center gap-1 px-1">
        {PALETTE.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setColor(c)}
            aria-label={`Color ${c}`}
            aria-pressed={color === c && tool === "pen"}
            className={clsx(
              "group relative h-7 w-7 rounded-lg transition-transform",
              "hover:-translate-y-0.5 active:translate-y-0",
              color === c &&
                tool === "pen" &&
                "ring-2 ring-neutral-900 ring-offset-2",
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

      {/* ─── brush sizes ─── */}
      <div className="flex items-center gap-0.5 px-1">
        {SIZES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSize(s)}
            aria-label={`Size ${s}`}
            aria-pressed={size === s}
            className={clsx(
              "grid h-9 w-9 place-items-center rounded-lg transition-colors",
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

      {/* ─── actions ─── */}
      <div className="flex items-center gap-0.5">
        <IconButton onClick={onUndo} disabled={!canUndo} label="Undo (⌘Z)">
          <UndoIcon />
        </IconButton>
        <IconButton onClick={onRedo} disabled={!canRedo} label="Redo (⇧⌘Z)">
          <RedoIcon />
        </IconButton>
        <IconButton onClick={onClear} label="Clear" tone="danger">
          <TrashIcon />
        </IconButton>
      </div>
    </div>
  );
}

/* ─── small primitives ────────────────────────────────────────── */

function Divider() {
  return <span className="mx-0.5 h-6 w-px bg-neutral-200" aria-hidden />;
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
        "grid h-8 w-9 place-items-center rounded-lg transition-all",
        active
          ? "bg-white text-neutral-900 shadow-sm"
          : "text-neutral-500 hover:text-neutral-900",
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
        "grid h-9 w-9 place-items-center rounded-lg transition-colors",
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

/* ─── icons (24px stroke, optical-sized 20px display) ─────────── */

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

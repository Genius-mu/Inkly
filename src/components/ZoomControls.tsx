import { useEffect, useRef, useState } from "react";
import { useStore } from "../lib/store";

const ZOOM_STEP = 1.25;
const PRESETS = [0.25, 0.5, 1, 2, 4];

interface Props {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}

export function ZoomControls({ canvasRef }: Props) {
  const view = useStore((s) => s.view);
  const zoomAt = useStore((s) => s.zoomAt);
  const resetView = useStore((s) => s.resetView);

  const [presetsOpen, setPresetsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!presetsOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setPresetsOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [presetsOpen]);

  const zoomFromCenter = (factor: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    zoomAt(factor, rect.width / 2, rect.height / 2);
  };

  const setAbsoluteZoom = (target: number) => {
    const factor = target / view.zoom;
    zoomFromCenter(factor);
    setPresetsOpen(false);
  };

  const percent = Math.round(view.zoom * 100);
  const isModified = view.zoom !== 1 || view.panX !== 0 || view.panY !== 0;

  return (
    <div
      className="
        pointer-events-auto absolute flex items-center gap-1.5
        bottom-[88px] left-3
        sm:bottom-6 sm:left-6
      "
    >
      <div
        ref={menuRef}
        className="
          relative flex items-center rounded-xl border border-neutral-200 bg-white
          shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-8px_rgba(0,0,0,0.12)]
        "
      >
        <ZoomButton
          onClick={() => zoomFromCenter(1 / ZOOM_STEP)}
          label="Zoom out"
          position="left"
        >
          <MinusIcon />
        </ZoomButton>

        <button
          type="button"
          onClick={() => setPresetsOpen((v) => !v)}
          aria-label="Zoom presets"
          aria-expanded={presetsOpen}
          className="
            min-w-[56px] px-1 py-2 text-center font-mono text-[12px] font-medium
            tabular-nums text-neutral-700 transition-colors hover:text-neutral-900
            sm:min-w-[64px]
          "
        >
          {percent}%
        </button>

        <ZoomButton
          onClick={() => zoomFromCenter(ZOOM_STEP)}
          label="Zoom in"
          position="right"
        >
          <PlusIcon />
        </ZoomButton>

        {presetsOpen && (
          <div
            className="
              absolute bottom-full left-0 mb-2 w-full min-w-[120px]
              animate-fade-in rounded-xl border border-neutral-200 bg-white p-1
              shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-8px_rgba(0,0,0,0.12)]
            "
          >
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setAbsoluteZoom(p)}
                className="
                  flex w-full items-center justify-between rounded-lg px-2.5 py-1.5
                  font-mono text-[12px] tabular-nums text-neutral-700
                  transition-colors hover:bg-neutral-100
                "
              >
                <span>{Math.round(p * 100)}%</span>
                {Math.abs(view.zoom - p) < 0.01 && (
                  <CheckIcon className="text-signal" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {isModified && (
        <button
          type="button"
          onClick={resetView}
          aria-label="Reset view"
          title="Reset view"
          className="
            grid h-9 w-9 animate-fade-in place-items-center
            rounded-xl border border-neutral-200 bg-white text-neutral-500
            shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-8px_rgba(0,0,0,0.12)]
            transition-colors hover:bg-neutral-50 hover:text-neutral-900
          "
        >
          <ResetIcon />
        </button>
      )}
    </div>
  );
}

function ZoomButton({
  onClick,
  label,
  position,
  children,
}: {
  onClick: () => void;
  label: string;
  position: "left" | "right";
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`
        grid h-9 w-9 place-items-center text-neutral-500
        transition-colors hover:bg-neutral-50 hover:text-neutral-900
        ${position === "left" ? "rounded-l-xl" : "rounded-r-xl"}
      `}
    >
      {children}
    </button>
  );
}

function MinusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px]">
      <path
        d="M5 12h14"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px]">
      <path
        d="M12 5v14M5 12h14"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ResetIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px]">
      <path
        d="M3 12a9 9 0 109-9"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M3 4v5h5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`h-3.5 w-3.5 ${className}`}>
      <path
        d="M4 12l5 5L20 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

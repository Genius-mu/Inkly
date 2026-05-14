import { useEffect, useState } from "react";

interface Shortcut {
  keys: string[];
  label: string;
}

const SHORTCUTS: Shortcut[] = [
  { keys: ["P"], label: "Pen" },
  { keys: ["E"], label: "Eraser" },
  { keys: ["R"], label: "Rectangle" },
  { keys: ["O"], label: "Ellipse" },
  { keys: ["L"], label: "Line" },
  { keys: ["A"], label: "Arrow" },
  { keys: ["Space", "drag"], label: "Pan" },
  { keys: ["⌘", "scroll"], label: "Zoom" },
  { keys: ["⌘", "Z"], label: "Undo" },
  { keys: ["⇧", "⌘", "Z"], label: "Redo" },
  { keys: ["Esc"], label: "Close dialog" },
  { keys: ["?"], label: "Show shortcuts" },
];

export function Shortcuts() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "?" && !isTyping(e.target)) {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Keyboard shortcuts (?)"
        aria-label="Keyboard shortcuts"
        className="
          pointer-events-auto absolute
          bottom-[88px] right-3
          sm:bottom-6 sm:right-6
          grid h-9 w-9 place-items-center
          rounded-full border border-neutral-200 bg-white
          font-mono text-sm font-medium text-neutral-500
          shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-8px_rgba(0,0,0,0.12)]
          transition-colors hover:bg-neutral-50 hover:text-neutral-900
        "
      >
        ?
      </button>

      {open && (
        <div
          className="absolute inset-0 z-40 animate-fade-in"
          onClick={() => setOpen(false)}
        >
          <div
            className="
              absolute w-72 rounded-2xl border border-neutral-200 bg-white p-2
              shadow-[0_1px_2px_rgba(0,0,0,0.04),0_24px_60px_-20px_rgba(0,0,0,0.25)]
              bottom-[140px] right-3
              sm:bottom-20 sm:right-6
              max-h-[60vh] overflow-y-auto
            "
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Keyboard shortcuts"
          >
            <div className="flex items-center justify-between px-2 pt-2 pb-1.5">
              <span className="font-mono text-[11px] tracking-wider text-neutral-500 uppercase">
                Shortcuts
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="grid h-6 w-6 place-items-center rounded-md text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
              >
                <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5">
                  <path
                    d="M6 6l12 12M6 18L18 6"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>

            <ul className="flex flex-col">
              {SHORTCUTS.map((s) => (
                <li
                  key={s.label}
                  className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-neutral-50"
                >
                  <span className="text-sm text-neutral-700">{s.label}</span>
                  <span className="flex items-center gap-1">
                    {s.keys.map((k) => (
                      <Key key={k}>{k}</Key>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-grid min-w-[22px] place-items-center rounded-md border border-neutral-200 bg-neutral-50 px-1.5 py-0.5 font-mono text-[10px] font-medium text-neutral-700">
      {children}
    </kbd>
  );
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}

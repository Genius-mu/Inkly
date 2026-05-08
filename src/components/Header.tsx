import { useStore } from "../lib/store";

export function Header() {
  const strokes = useStore((s) => s.strokes);
  const tool = useStore((s) => s.tool);

  return (
    <header className="safe-x flex items-center justify-between border-b border-neutral-200 bg-white/80 px-4 py-3 backdrop-blur-md sm:px-6 sm:py-3.5">
      {/* ─── wordmark ─── */}
      <div className="flex items-center gap-2 sm:gap-2.5">
        <Mark />
        <h1 className="text-base font-semibold tracking-tight text-neutral-900 sm:text-[19px]">
          Inkly
        </h1>
        <span className="ml-1 hidden rounded-md bg-neutral-100 px-1.5 py-0.5 font-mono text-[10px] font-medium text-neutral-500 sm:inline">
          v0.1
        </span>
      </div>

      {/* ─── status pills ─── */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        <Pill>
          <span className="h-1.5 w-1.5 rounded-full bg-signal" />
          <span className="font-medium tabular-nums text-neutral-900">
            {strokes.length}
          </span>
          <span className="hidden text-neutral-500 sm:inline">
            {strokes.length === 1 ? "stroke" : "strokes"}
          </span>
        </Pill>

        <Pill>
          <span className="hidden text-neutral-500 sm:inline">tool</span>
          <span className="font-medium text-neutral-900">{tool}</span>
        </Pill>
      </div>
    </header>
  );
}

function Mark() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-6 w-6 sm:h-7 sm:w-7"
      aria-hidden="true"
    >
      <path
        d="M 4 6 Q 4 4 6 4 L 14 4 L 20 10 L 20 18 Q 20 20 18 20 L 6 20 Q 4 20 4 18 Z"
        fill="#0a0a0a"
      />
      <path d="M 14 4 L 20 10 L 14 10 Z" fill="#2563eb" />
      <circle cx="11" cy="14" r="1.6" fill="white" />
    </svg>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-2 py-1 font-mono text-[11px] sm:px-2.5">
      {children}
    </div>
  );
}

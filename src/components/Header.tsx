import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../lib/store";
import { signOut } from "../lib/supabase";
import type { Drawable } from "../types";

export function Header() {
  const drawables = useStore((s) => s.drawables);
  const user = useStore((s) => s.user);

  return (
    <header
      className="
        safe-x relative z-40 flex items-center justify-between
        border-b border-neutral-200 bg-white/85 px-4 py-3 backdrop-blur-md
        sm:px-6 sm:py-3
      "
    >
      {/* ─── left: brand + room context ─── */}
      <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
        <Mark />
        <div className="flex min-w-0 items-baseline gap-2">
          <h1 className="text-base font-semibold tracking-tight text-neutral-900 sm:text-[17px]">
            Inkly
          </h1>
          <span className="hidden text-neutral-300 sm:inline" aria-hidden>
            /
          </span>
          <RoomContext />
        </div>
      </div>

      {/* ─── right: items chip + user ─── */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        <ItemsChip drawables={drawables} />
        {user && <UserChip email={user.email ?? user.name} />}
      </div>
    </header>
  );
}

/* ─── room context: name + sync status ─────────────────────── */

function RoomContext() {
  const lastActivityAt = useStore((s) => s.lastActivityAt);
  const [recentlyChanged, setRecentlyChanged] = useState(false);

  // Pulse the sync dot for ~700ms whenever something changes.
  useEffect(() => {
    if (lastActivityAt === 0) return;
    setRecentlyChanged(true);
    const t = setTimeout(() => setRecentlyChanged(false), 700);
    return () => clearTimeout(t);
  }, [lastActivityAt]);

  return (
    <div className="flex min-w-0 flex-col">
      <span className="truncate text-[13px] font-medium text-neutral-700 sm:text-sm">
        solo canvas
      </span>
      <span className="hidden items-center gap-1 font-mono text-[10px] tracking-wide text-neutral-400 sm:inline-flex">
        <span
          className={`
            inline-block h-1 w-1 rounded-full transition-all duration-500
            ${recentlyChanged ? "bg-signal scale-150" : "bg-neutral-300 scale-100"}
          `}
          aria-hidden
        />
        <span>{recentlyChanged ? "syncing" : "saved · local"}</span>
      </span>
    </div>
  );
}

/* ─── items chip — count + animated rollover ───────────────── */

interface ItemsChipProps {
  drawables: Drawable[];
}

function ItemsChip({ drawables }: ItemsChipProps) {
  const breakdown = useMemo(() => countByKind(drawables), [drawables]);

  // Animate the count number on change.
  const prevCount = useRef(drawables.length);
  const [bump, setBump] = useState(false);
  useEffect(() => {
    if (drawables.length !== prevCount.current) {
      setBump(true);
      const t = setTimeout(() => setBump(false), 240);
      prevCount.current = drawables.length;
      return () => clearTimeout(t);
    }
  }, [drawables.length]);

  // Hover state for desktop breakdown reveal.
  const [hovered, setHovered] = useState(false);

  const summary = summarizeBreakdown(breakdown);

  return (
    <div
      className="
        group relative inline-flex items-center gap-1.5 rounded-full
        border border-neutral-200 bg-white py-1 pr-2.5 pl-2
        font-mono text-[11px] transition-colors hover:bg-neutral-50
      "
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={fullBreakdownString(breakdown)}
    >
      <span
        className={`
          inline-block h-1.5 w-1.5 rounded-full transition-all duration-300
          ${bump ? "scale-150 bg-signal" : "scale-100 bg-neutral-400"}
        `}
        aria-hidden
      />
      <span
        key={drawables.length /* re-mount on change → triggers transition */}
        className={`
          tabular-nums font-medium text-neutral-900 transition-transform duration-200
          ${bump ? "scale-110" : "scale-100"}
        `}
      >
        {drawables.length}
      </span>
      <span className="hidden text-neutral-500 sm:inline">
        {hovered ? summary : drawables.length === 1 ? "item" : "items"}
      </span>
    </div>
  );
}

interface KindCounts {
  stroke: number;
  shape: number;
  text: number;
  sticky: number;
}

function countByKind(drawables: Drawable[]): KindCounts {
  const counts: KindCounts = { stroke: 0, shape: 0, text: 0, sticky: 0 };
  for (const d of drawables) counts[d.kind]++;
  return counts;
}

/** Short summary for the chip — names only the most-prominent kinds. */
function summarizeBreakdown(c: KindCounts): string {
  const parts: string[] = [];
  if (c.stroke) parts.push(`${c.stroke} stroke${c.stroke === 1 ? "" : "s"}`);
  if (c.shape) parts.push(`${c.shape} shape${c.shape === 1 ? "" : "s"}`);
  if (c.text) parts.push(`${c.text} text`);
  if (c.sticky) parts.push(`${c.sticky} sticky`);
  if (parts.length === 0) return "empty canvas";
  // Keep it short on hover — first two kinds, then "…" if more.
  if (parts.length <= 2) return parts.join(" · ");
  return parts.slice(0, 2).join(" · ") + " · …";
}

/** Full breakdown for the title tooltip. */
function fullBreakdownString(c: KindCounts): string {
  const parts: string[] = [];
  if (c.stroke) parts.push(`${c.stroke} stroke${c.stroke === 1 ? "" : "s"}`);
  if (c.shape) parts.push(`${c.shape} shape${c.shape === 1 ? "" : "s"}`);
  if (c.text) parts.push(`${c.text} text item${c.text === 1 ? "" : "s"}`);
  if (c.sticky)
    parts.push(`${c.sticky} sticky note${c.sticky === 1 ? "" : "s"}`);
  return parts.length === 0 ? "Empty canvas" : parts.join(", ");
}

/* ─── user chip (largely unchanged — only minor tweaks) ───── */

interface UserChipProps {
  email: string;
}

function UserChip({ email }: UserChipProps) {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(
    null,
  );

  useEffect(() => {
    if (!open) return;

    const place = () => {
      const btn = buttonRef.current;
      const menu = menuRef.current;
      if (!btn || !menu) return;
      const btnRect = btn.getBoundingClientRect();
      const menuRect = menu.getBoundingClientRect();
      const left = btnRect.right - menuRect.width;
      const top = btnRect.bottom + 6;
      setAnchor({
        left: Math.max(
          8,
          Math.min(left, window.innerWidth - menuRect.width - 8),
        ),
        top: Math.max(8, top),
      });
    };

    place();
    const raf = requestAnimationFrame(place);
    window.addEventListener("resize", place);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (buttonRef.current?.contains(t) || menuRef.current?.contains(t))
        return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
      setOpen(false);
    }
  };

  const initial = email.charAt(0).toUpperCase() || "?";

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="
          inline-flex items-center gap-2 rounded-full border border-neutral-200
          bg-white py-1 pr-3 pl-1 transition-all
          hover:bg-neutral-50 hover:border-neutral-300
          active:scale-[0.97]
        "
        title="Account"
      >
        <span
          aria-hidden
          className="
            grid h-6 w-6 place-items-center rounded-full
            bg-gradient-to-br from-signal to-signal-deep
            font-mono text-[11px] font-semibold text-white
            shadow-[inset_0_-1px_0_rgba(0,0,0,0.15)]
          "
        >
          {initial}
        </span>
        <span className="hidden max-w-[160px] truncate font-mono text-[11px] text-neutral-700 sm:inline">
          {email}
        </span>
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          className="
            fixed z-50 w-56 animate-fade-in
            rounded-xl border border-neutral-200 bg-white p-1
            shadow-[0_1px_2px_rgba(0,0,0,0.04),0_24px_60px_-20px_rgba(0,0,0,0.25)]
          "
          style={{
            left: anchor?.left ?? -9999,
            top: anchor?.top ?? -9999,
            visibility: anchor ? "visible" : "hidden",
          }}
        >
          <div className="border-b border-neutral-100 px-3 py-2.5">
            <p className="text-[10px] tracking-wider uppercase text-neutral-400">
              Signed in as
            </p>
            <p className="mt-0.5 truncate font-mono text-[12px] text-neutral-900">
              {email}
            </p>
          </div>

          <button
            type="button"
            role="menuitem"
            onClick={handleSignOut}
            disabled={signingOut}
            className="
              mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2
              text-sm text-neutral-700 transition-colors
              hover:bg-neutral-50
              disabled:cursor-not-allowed disabled:opacity-50
            "
          >
            <SignOutIcon />
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      )}
    </>
  );
}

/* ─── primitives ─── */

function Mark() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-7 w-7 sm:h-8 sm:w-8"
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

function SignOutIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-neutral-500">
      <path
        d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

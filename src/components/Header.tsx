import { useEffect, useRef, useState } from "react";
import { useStore } from "../lib/store";
import { signOut } from "../lib/supabase";

export function Header() {
  const drawables = useStore((s) => s.drawables);
  const user = useStore((s) => s.user);

  return (
    <header className="safe-x z-50 flex items-center justify-between border-b border-neutral-200 bg-white/80 px-4 py-3 backdrop-blur-md sm:px-6 sm:py-3.5">
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

      {/* ─── status: items count + user chip ─── */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        <Pill>
          <span className="h-1.5 w-1.5 rounded-full bg-signal" />
          <span className="font-medium tabular-nums text-neutral-900">
            {drawables.length}
          </span>
          <span className="hidden text-neutral-500 sm:inline">
            {drawables.length === 1 ? "item" : "items"}
          </span>
        </Pill>

        {user && <UserChip email={user.email ?? user.name} />}
      </div>
    </header>
  );
}

/* ─── user chip with dropdown menu ───────────────────────────── */

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

  // Position the menu when it opens, and reposition on resize.
  useEffect(() => {
    if (!open) return;

    const place = () => {
      const btn = buttonRef.current;
      const menu = menuRef.current;
      if (!btn || !menu) return;
      const btnRect = btn.getBoundingClientRect();
      const menuRect = menu.getBoundingClientRect();
      // Right-align the menu's right edge with the button's right edge.
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

  // Click outside closes.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (buttonRef.current?.contains(t) || menuRef.current?.contains(t)) {
        return;
      }
      setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  // Escape key closes the menu.
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
      // The auth state listener in useAuth.ts picks this up and the
      // modal re-mounts automatically — nothing else for us to do.
    } finally {
      // No need to setSigningOut(false) — the component will unmount
      // when the auth state flips. But just in case:
      setSigningOut(false);
      setOpen(false);
    }
  };

  // Initial for the small avatar circle inside the chip.
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
          bg-white py-1 pr-3 pl-1
          transition-colors hover:bg-neutral-50
        "
        title="Account"
      >
        <span
          aria-hidden
          className="
            grid h-6 w-6 place-items-center rounded-full
            bg-signal font-mono text-[11px] font-medium text-white
          "
        >
          {initial}
        </span>
        <span
          className="
            hidden max-w-[160px] truncate font-mono text-[11px]
            text-neutral-700 sm:inline
          "
        >
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
          {/* email header — shown in full inside the menu, even if truncated in the chip */}
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

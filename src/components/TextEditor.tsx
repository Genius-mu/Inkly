import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useStore } from "../lib/store";
import { worldToScreen } from "../lib/drawing";
import type { StickyNote, TextItem } from "../types";

interface Props {
  /** The drawable currently being edited (must be text or sticky). */
  drawable: TextItem | StickyNote;
}

/** Sticky note backgrounds — kept in sync with drawing.ts. */
const STICKY_BG: Record<StickyNote["background"], string> = {
  yellow: "#fef9c3",
  pink: "#fce7f3",
  blue: "#dbeafe",
  green: "#dcfce7",
};

const STICKY_BORDER: Record<StickyNote["background"], string> = {
  yellow: "#facc15",
  pink: "#f9a8d4",
  blue: "#93c5fd",
  green: "#86efac",
};

/** Sticky dimensions in world space — kept in sync with drawing.ts. */
const STICKY_W = 240;
const STICKY_H = 180;

export function TextEditor({ drawable }: Props) {
  const view = useStore((s) => s.view);
  const updateDrawable = useStore((s) => s.updateDrawable);
  const finishEditing = useStore((s) => s.finishEditing);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState(drawable.text);

  /* ─── focus on mount + select all ─── */
  useLayoutEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.focus();
    // Place caret at end so existing text isn't immediately overwritten.
    const end = ta.value.length;
    ta.setSelectionRange(end, end);
  }, []);

  /* ─── auto-resize textarea to fit content (text only) ─── */
  useLayoutEffect(() => {
    if (drawable.kind !== "text") return;
    const ta = textareaRef.current;
    if (!ta) return;
    // Reset to natural size, then expand to scrollHeight.
    ta.style.height = "auto";
    ta.style.height = `${ta.scrollHeight}px`;
    ta.style.width = "auto";
    // Force layout, then measure the line widths to set a tight width.
    // scrollWidth includes padding/border; we want enough room + a
    // little buffer for the caret at the end of the line.
    ta.style.width = `${ta.scrollWidth + 2}px`;
  }, [text, view.zoom, drawable.kind]);

  /* ─── commit on blur / click-outside ─── */
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const ta = textareaRef.current;
      if (!ta) return;
      if (!ta.contains(e.target as Node)) {
        // Click outside the editor — commit and finish.
        finishEditing();
      }
    };
    // Use pointerdown (not click) so a single-click outside commits
    // before any other handlers see the click.
    document.addEventListener("pointerdown", onPointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", onPointerDown, true);
  }, [finishEditing]);

  /* ─── handle typing ─── */
  const onChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value;
    setText(next);
    updateDrawable(drawable.id, { text: next } as Partial<typeof drawable>);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      finishEditing();
    }
    // Cmd/Ctrl+Enter also commits, for users who want to type and dismiss.
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      finishEditing();
    }
  };

  /* ─── position + style ─── */

  // Convert the drawable's world-space position to screen pixels.
  const position =
    drawable.kind === "text" ? drawable.position : drawable.position;

  const screen = worldToScreen(position, view);

  // Common styles for both text and sticky editors.
  const baseStyle: React.CSSProperties = {
    position: "absolute",
    left: screen.x,
    top: screen.y,
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif",
    margin: 0,
    padding: 0,
    border: "none",
    outline: "none",
    background: "transparent",
    resize: "none",
    whiteSpace: "pre",
    overflow: "hidden",
    zIndex: 30,
  };

  if (drawable.kind === "text") {
    return (
      <textarea
        ref={textareaRef}
        value={text}
        onChange={onChange}
        onKeyDown={onKeyDown}
        spellCheck={false}
        placeholder="Type…"
        style={{
          ...baseStyle,
          color: drawable.color,
          fontSize: drawable.fontSize * view.zoom,
          lineHeight: 1.25,
          // Subtle dashed outline to signal "editable", removed via CSS class.
        }}
        className="inkly-editor"
        rows={1}
      />
    );
  }

  // Sticky note — fixed dimensions in world space, scaled by zoom.
  const w = STICKY_W * view.zoom;
  const h = STICKY_H * view.zoom;
  const padding = 16 * view.zoom;

  return (
    <div
      style={{
        position: "absolute",
        left: screen.x,
        top: screen.y,
        width: w,
        height: h,
        background: STICKY_BG[drawable.background],
        border: `${1.5}px solid ${STICKY_BORDER[drawable.background]}`,
        borderRadius: 8 * view.zoom,
        boxShadow: `0 ${4 * view.zoom}px ${12 * view.zoom}px rgba(0,0,0,0.15)`,
        padding,
        zIndex: 30,
      }}
    >
      <textarea
        ref={textareaRef}
        value={text}
        onChange={onChange}
        onKeyDown={onKeyDown}
        spellCheck={false}
        placeholder="Type a note…"
        style={{
          width: "100%",
          height: "100%",
          fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif",
          color: "#1a1a1a",
          fontSize: 16 * view.zoom,
          lineHeight: "22px",
          background: "transparent",
          border: "none",
          outline: "none",
          padding: 0,
          margin: 0,
          resize: "none",
        }}
        className="inkly-editor"
      />
    </div>
  );
}

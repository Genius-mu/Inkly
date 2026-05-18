/**
 * Inkly — Supabase client + auth + realtime
 *
 * Everything that crosses the network lives here. The rest of the
 * app imports from this module, not from @supabase/supabase-js,
 * so we have one place to swap, mock, or upgrade if needed.
 *
 * If env vars are missing, every helper becomes a safe no-op
 * (with a friendly console message) so the app still runs locally.
 */

import {
  createClient,
  type RealtimeChannel,
  type SupabaseClient,
} from "@supabase/supabase-js";
import type { DrawAction, RemoteCursor, Stroke } from "../types";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** True only when both env vars are set to real-looking values. */
export const isConfigured = Boolean(
  url && key && !url.includes("your-project"),
);

/**
 * The single shared Supabase client. `null` when env vars are missing —
 * every helper below checks for this and bails out gracefully.
 */
export const supabase: SupabaseClient | null = isConfigured
  ? createClient(url!, key!, {
      realtime: { params: { eventsPerSecond: 20 } },
    })
  : null;

if (!isConfigured && typeof window !== "undefined") {
  console.info(
    "%cInkly%c · running offline (Supabase credentials missing).",
    "background:#0a0a0a;color:#fff;padding:2px 6px;border-radius:3px;font-weight:600",
    "color:#666",
  );
}

/* ─────────────────────────── auth ─────────────────────────── */

/** Sign in with email + password. Throws on failure with a user-readable message. */
export async function signIn(email: string, password: string): Promise<void> {
  if (!supabase) throw new Error("Auth is not configured.");
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(humanizeAuthError(error.message));
}

/** Create a new account. Supabase sends a confirmation email to the address. */
export async function signUp(email: string, password: string): Promise<void> {
  if (!supabase) throw new Error("Auth is not configured.");
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: window.location.origin,
    },
  });
  if (error) throw new Error(humanizeAuthError(error.message));
}

/** Sign out the current user. */
export async function signOut(): Promise<void> {
  if (!supabase) return;
  await supabase.auth.signOut();
}

/** Send a password-reset email. */
export async function sendPasswordReset(email: string): Promise<void> {
  if (!supabase) throw new Error("Auth is not configured.");
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin,
  });
  if (error) throw new Error(humanizeAuthError(error.message));
}

/**
 * Translate Supabase's error messages into something a user can read.
 * Supabase returns useful but engineer-flavored strings; we polish them.
 */
function humanizeAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials"))
    return "Wrong email or password.";
  if (m.includes("email not confirmed"))
    return "Please confirm your email first — check your inbox.";
  if (m.includes("user already registered"))
    return "An account with this email already exists.";
  if (m.includes("password should be at least"))
    return "Password must be at least 8 characters.";
  if (m.includes("rate limit"))
    return "Too many attempts. Try again in a moment.";
  if (m.includes("email rate limit"))
    return "Too many emails sent. Try again later.";
  return message.charAt(0).toUpperCase() + message.slice(1);
}

/* ─────────────────────────── persistence (for realtime later) ─── */

/**
 * Save a stroke to the database. Fire-and-forget — the local UI
 * has already rendered the stroke; the network call happens in the
 * background and we log (but don't surface) any failure.
 *
 * Not wired anywhere yet — Step 31 (realtime sync) will use this.
 */
export async function saveStroke(
  roomId: string,
  stroke: Stroke,
): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("strokes").insert({
    id: stroke.id,
    room_id: roomId,
    user_id: stroke.userId,
    payload: stroke,
    created_at: stroke.createdAt,
  });
  if (error) console.error("[inkly] saveStroke failed:", error.message);
}

/** Fetch all strokes for a room, ordered by creation time. */
export async function loadStrokes(roomId: string): Promise<Stroke[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("strokes")
    .select("payload")
    .eq("room_id", roomId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[inkly] loadStrokes failed:", error.message);
    return [];
  }
  return (data ?? []).map((row) => row.payload as Stroke);
}

/* ─────────────────────────── realtime (for later) ─────────────── */

interface SubscribeOptions {
  roomId: string;
  userId: string;
  onAction: (action: DrawAction) => void;
  onCursor: (cursor: RemoteCursor) => void;
  onPresenceLeave: (userId: string) => void;
}

export function subscribeToRoom(
  opts: SubscribeOptions,
): RealtimeChannel | null {
  if (!supabase) return null;
  const { roomId, userId, onAction, onCursor, onPresenceLeave } = opts;

  const channel = supabase.channel(`room:${roomId}`, {
    config: { presence: { key: userId } },
  });

  channel.on("broadcast", { event: "draw" }, (payload) => {
    onAction(payload.payload as DrawAction);
  });

  channel.on("broadcast", { event: "cursor" }, (payload) => {
    const cursor = payload.payload as RemoteCursor;
    if (cursor.userId !== userId) onCursor(cursor);
  });

  channel.on("presence", { event: "leave" }, ({ leftPresences }) => {
    for (const p of leftPresences as Array<{ userId?: string }>) {
      if (p.userId) onPresenceLeave(p.userId);
    }
  });

  channel.subscribe(async (status) => {
    if (status === "SUBSCRIBED") {
      await channel.track({ userId, joinedAt: Date.now() });
    }
  });

  return channel;
}

export function broadcastAction(
  channel: RealtimeChannel | null,
  action: DrawAction,
): void {
  if (!channel) return;
  channel.send({ type: "broadcast", event: "draw", payload: action });
}

export function broadcastCursor(
  channel: RealtimeChannel | null,
  cursor: RemoteCursor,
): void {
  if (!channel) return;
  channel.send({ type: "broadcast", event: "cursor", payload: cursor });
}

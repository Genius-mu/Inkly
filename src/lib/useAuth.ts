/**
 * Inkly — auth state subscription
 *
 * Subscribes to Supabase auth state changes and mirrors them into
 * the Zustand store. Run this once at the top level of the app.
 */

import { useEffect } from "react";
import { supabase, isConfigured } from "./supabase";
import { useStore } from "./store";
import { pickPresenceColor } from "./utils";
import type { User } from "../types";

/** Convert a Supabase user object into our app's User shape. */
function toAppUser(supaUser: { id: string; email?: string | null }): User {
  const email = supaUser.email ?? "";
  // Derive a display name from the email (the part before @).
  // We don't have a "name" field — for portfolio scope this is enough.
  const name = email.split("@")[0] || "anonymous";
  return {
    id: supaUser.id,
    name,
    color: pickPresenceColor(supaUser.id),
  };
}

export function useAuth() {
  const setUser = useStore((s) => s.setUser);
  const setAuthReady = useStore((s) => s.setAuthReady);

  useEffect(() => {
    // If Supabase isn't configured, mark auth as "ready" (with null user)
    // so the gate doesn't hang forever in offline mode.
    if (!isConfigured || !supabase) {
      setAuthReady(true);
      return;
    }

    // 1. Check for an existing session on mount.
    //    Supabase persists sessions in localStorage by default — this is
    //    how "stay signed in across reloads" works without us doing anything.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(toAppUser(session.user));
      } else {
        setUser(null);
      }
      setAuthReady(true);
    });

    // 2. Subscribe to future changes (sign-in, sign-out, token refresh).
    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ? toAppUser(session.user) : null);
      },
    );

    return () => {
      subscription.subscription.unsubscribe();
    };
  }, [setUser, setAuthReady]);
}

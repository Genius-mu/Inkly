import { useState } from "react";
import clsx from "clsx";
import { signIn, signUp, sendPasswordReset } from "../lib/supabase";

type View = "sign-in" | "sign-up" | "check-email" | "forgot-password";

interface Props {
  initialView?: View;
}

export function AuthModal({ initialView = "sign-in" }: Props) {
  const [view, setView] = useState<View>(initialView);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const switchView = (next: View) => {
    setError(null);
    setPassword("");
    setView(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Client-side validation — minimal, just catches the obvious cases
    // before bothering the network.
    if (!email.includes("@")) {
      setError("Please enter a valid email.");
      return;
    }
    if (
      view !== "forgot-password" &&
      password.length < 8 &&
      view === "sign-up"
    ) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);
    try {
      if (view === "sign-in") {
        await signIn(email, password);
        // On success, the auth state listener fires and the modal
        // unmounts (since `user` becomes non-null). No need to do
        // anything else here.
      } else if (view === "sign-up") {
        await signUp(email, password);
        switchView("check-email");
      } else if (view === "forgot-password") {
        await sendPasswordReset(email);
        switchView("check-email");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="
        fixed inset-0 z-50 grid place-items-center px-4
        bg-neutral-900/40 backdrop-blur-md
        animate-fade-in
      "
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-title"
    >
      <div
        className="
          w-[min(420px,100%)] rounded-2xl bg-white p-7
          shadow-[0_1px_2px_rgba(0,0,0,0.04),0_24px_60px_-20px_rgba(0,0,0,0.4)]
        "
      >
        {view === "sign-in" || view === "sign-up" ? (
          <Tabs view={view} setView={switchView} />
        ) : (
          <BackButton onClick={() => switchView("sign-in")} />
        )}

        <h2
          id="auth-title"
          className="mt-5 text-xl font-semibold tracking-tight text-neutral-900"
        >
          {view === "sign-in" && "Welcome back"}
          {view === "sign-up" && "Create your account"}
          {view === "forgot-password" && "Reset your password"}
          {view === "check-email" && "Check your email"}
        </h2>

        <p className="mt-1 text-sm text-neutral-500">
          {view === "sign-in" && "Sign in to keep drawing on Inkly."}
          {view === "sign-up" && "Get started — it takes about a minute."}
          {view === "forgot-password" &&
            "Enter your email and we'll send a reset link."}
          {view === "check-email" && (
            <>
              We sent a link to{" "}
              <span className="font-medium text-neutral-900">
                {email || "your inbox"}
              </span>
              . Click it to continue.
            </>
          )}
        </p>

        {view === "check-email" ? (
          <CheckEmailView onTryAnother={() => switchView("sign-in")} />
        ) : (
          <form
            onSubmit={handleSubmit}
            className="mt-5 flex flex-col gap-4"
            noValidate
          >
            <Field
              id="email"
              label="Email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={setEmail}
              placeholder="you@example.com"
              required
              autoFocus
            />

            {view !== "forgot-password" && (
              <Field
                id="password"
                label="Password"
                type="password"
                autoComplete={
                  view === "sign-up" ? "new-password" : "current-password"
                }
                value={password}
                onChange={setPassword}
                placeholder={
                  view === "sign-up" ? "At least 8 characters" : "Your password"
                }
                required
                minLength={view === "sign-up" ? 8 : undefined}
                hint={
                  view === "sign-up"
                    ? "8+ characters. No other rules."
                    : undefined
                }
              />
            )}

            {view === "sign-in" && (
              <button
                type="button"
                onClick={() => switchView("forgot-password")}
                className="-mt-1 self-end text-[12px] text-neutral-500 transition-colors hover:text-signal"
              >
                Forgot password?
              </button>
            )}

            {error && <FormError message={error} />}

            <button
              type="submit"
              disabled={
                loading || !email || (view !== "forgot-password" && !password)
              }
              className="
                mt-1 rounded-lg bg-neutral-900 px-4 py-2.5
                text-sm font-medium text-white transition-colors
                hover:bg-signal-deep
                disabled:cursor-not-allowed disabled:bg-neutral-300
              "
            >
              {loading
                ? "One moment…"
                : view === "sign-in"
                  ? "Sign in"
                  : view === "sign-up"
                    ? "Create account"
                    : "Send reset link"}
            </button>

            {view === "sign-up" && (
              <p className="text-center text-[11px] text-neutral-400">
                By signing up you agree to be a respectful collaborator on this
                canvas.
              </p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}

/* ─── sub-components (unchanged from 30b) ─── */

function Tabs({ view, setView }: { view: View; setView: (v: View) => void }) {
  return (
    <div className="flex rounded-xl bg-neutral-100 p-0.5">
      <button
        type="button"
        onClick={() => setView("sign-in")}
        className={clsx(
          "flex-1 rounded-lg py-2 text-sm font-medium transition-all",
          view === "sign-in"
            ? "bg-white text-neutral-900 shadow-sm"
            : "text-neutral-500 hover:text-neutral-900",
        )}
      >
        Sign in
      </button>
      <button
        type="button"
        onClick={() => setView("sign-up")}
        className={clsx(
          "flex-1 rounded-lg py-2 text-sm font-medium transition-all",
          view === "sign-up"
            ? "bg-white text-neutral-900 shadow-sm"
            : "text-neutral-500 hover:text-neutral-900",
        )}
      >
        Sign up
      </button>
    </div>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="
        inline-flex items-center gap-1.5 text-[12px] font-medium text-neutral-500
        transition-colors hover:text-neutral-900
      "
    >
      <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5">
        <path
          d="M15 18l-6-6 6-6"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      Back to sign in
    </button>
  );
}

interface FieldProps {
  id: string;
  label: string;
  type: "email" | "password" | "text";
  autoComplete?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
  hint?: string;
  autoFocus?: boolean;
}

function Field({
  id,
  label,
  type,
  autoComplete,
  value,
  onChange,
  placeholder,
  required,
  minLength,
  hint,
  autoFocus,
}: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="text-[11px] font-medium tracking-wider uppercase text-neutral-500"
      >
        {label}
      </label>
      <input
        id={id}
        type={type}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        minLength={minLength}
        autoFocus={autoFocus}
        className="
          rounded-lg border border-neutral-200 bg-white px-3 py-2
          text-sm text-neutral-900 placeholder:text-neutral-400
          transition-colors
          focus:border-signal focus:outline-none focus:ring-2 focus:ring-signal/15
        "
      />
      {hint && <p className="text-[11px] text-neutral-400">{hint}</p>}
    </div>
  );
}

function FormError({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">
      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 shrink-0 mt-px">
        <path
          d="M12 8v5M12 16h.01M10.3 3.86l-8.49 14.14A2 2 0 003.51 21h16.98a2 2 0 001.71-3l-8.49-14.14a2 2 0 00-3.41 0z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {message}
    </div>
  );
}

function CheckEmailView({ onTryAnother }: { onTryAnother: () => void }) {
  return (
    <div className="mt-6 flex flex-col gap-4">
      <div className="grid h-12 w-12 place-items-center rounded-xl bg-signal-soft">
        <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6 text-signal">
          <path
            d="M3 8l9 6 9-6M3 8v10a2 2 0 002 2h14a2 2 0 002-2V8M3 8a2 2 0 012-2h14a2 2 0 012 2"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <p className="text-sm leading-relaxed text-neutral-600">
        Open the email and click the verification link to continue. The link
        expires in 24 hours.
      </p>

      <button
        type="button"
        onClick={onTryAnother}
        className="
          self-start text-[12px] font-medium text-neutral-500
          transition-colors hover:text-signal
        "
      >
        Use a different email
      </button>
    </div>
  );
}

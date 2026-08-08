import { useLayoutEffect, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Check, Eye, EyeOff, UserRound } from "lucide-react";

import { useToast } from "@/hooks/use-toast";
import { useTokenPagePrivacy } from "@/hooks/use-token-page-privacy";
import logoImage from "@assets/IMG_6592_1755070818452.png";
import "./merchant-signup.css";

/**
 * Invited teammates land here from their email. The token in the URL is the
 * whole credential, so this page is deliberately unauthenticated — and it never
 * reveals whether a token is unknown, expired or already used.
 */
export default function AcceptInvite() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  useTokenPagePrivacy();

  const [token, setToken] = useState(
    () => new URLSearchParams(window.location.search).get("token") ?? "",
  );
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  // The invite token is a credential. Keep it in component memory for the one
  // POST, but remove it from the address bar before paint so it cannot leak via
  // screenshots, copied URLs, analytics or same-page referrers.
  useLayoutEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("token")) return;
    url.searchParams.delete("token");
    const query = url.searchParams.toString();
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${query ? `?${query}` : ""}${url.hash}`,
    );
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
      setError("Use at least 8 characters with an uppercase letter, a lowercase letter and a number.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch("/api/team/accept-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, name: name.trim() || undefined, password, confirmPassword }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.message || "This invite is no longer valid.");
      setToken("");
      setDone(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "This invite is no longer valid.");
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <main className="signup-page">
        <div className="signup-shell">
          <div className="signup-brand-row">
            <img src={logoImage} alt="TaptPay" />
          </div>
          <div className="verification-sent-card">
            <h1>Your login is ready</h1>
            <p>Sign in with your email address and the password you just set.</p>
            <button onClick={() => setLocation("/login")}>
              <Check /> Go to sign in
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (!token) {
    return (
      <main className="signup-page">
        <div className="signup-shell">
          <div className="signup-brand-row">
            <img src={logoImage} alt="TaptPay" />
          </div>
          <div className="verification-sent-card">
            <h1>Invite link incomplete</h1>
            <p>Open the link straight from your invite email, or ask the account owner to send a new one.</p>
            <button onClick={() => setLocation("/login")}>Go to sign in</button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="signup-page">
      <button className="signup-page-back" onClick={() => setLocation("/")}>
        <ArrowLeft /> Back
      </button>
      <div className="signup-shell">
        <div className="signup-brand-row">
          <img src={logoImage} alt="TaptPay" />
          <p>
            Already have an account? <button onClick={() => setLocation("/login")}>Sign in</button>
          </p>
        </div>

        <form onSubmit={submit} style={{ padding: "0 clamp(1.1rem, 4vw, 2.6rem) 2.4rem" }}>
          <div className="signup-step-heading">
            <div className="signup-step-icon">
              <UserRound aria-hidden="true" />
            </div>
            <div>
              <p className="signup-eyebrow">Team invite</p>
              <h1>Set up your login</h1>
              <p className="signup-description">
                Choose a password and you're in. Your teammates each get their own login.
              </p>
            </div>
          </div>

          <div className="signup-fields signup-fields-one">
            <label className="signup-field">
              <span>Your name<em>Optional</em></span>
              <div className="signup-input-wrap">
                <input
                  name="name"
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Your full name"
                  autoComplete="name"
                />
              </div>
            </label>

            <label className="signup-field">
              <span>Create password</span>
              <div className="signup-input-wrap">
                <input
                  name="password"
                  type={revealed ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="8+ characters"
                  autoComplete="new-password"
                  aria-invalid={!!error}
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setRevealed((value) => !value)}
                  aria-label={revealed ? "Hide password" : "Show password"}
                >
                  {revealed ? <EyeOff /> : <Eye />}
                </button>
              </div>
            </label>

            <label className="signup-field">
              <span>Confirm password</span>
              <div className="signup-input-wrap">
                <input
                  name="confirmPassword"
                  type={revealed ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Repeat password"
                  autoComplete="new-password"
                  aria-invalid={!!error}
                />
              </div>
            </label>
          </div>

          {error && (
            <small className="signup-error" role="alert" style={{ display: "block", marginTop: "0.85rem" }}>
              {error}
            </small>
          )}

          <button
            type="submit"
            className="plan-accept-submit"
            disabled={submitting}
            data-testid="accept-invite-submit"
          >
            {submitting ? "Setting up…" : "Create my login"}
          </button>
        </form>
      </div>
    </main>
  );
}

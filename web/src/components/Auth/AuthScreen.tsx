import { useState } from "react";
import { useAuthStore } from "../../stores/authStore";
import { apiClient } from "../../api/client";

type Mode = "login" | "register" | "forgot";

export default function AuthScreen() {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [forgotMessage, setForgotMessage] = useState<string | null>(null);
  const [forgotLoading, setForgotLoading] = useState(false);
  const { loading, error, login, register, clearError } = useAuthStore();

  const switchMode = (m: Mode) => {
    setMode(m);
    clearError();
    setForgotMessage(null);
    setEmail("");
    setPassword("");
    setDisplayName("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (mode === "login") {
        await login(email, password);
      } else if (mode === "register") {
        await register(email, password, displayName);
      }
    } catch {
      // Error is already set in the store
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotLoading(true);
    setForgotMessage(null);
    clearError();
    try {
      const msg = await apiClient.forgotPassword(email);
      setForgotMessage(msg);
    } catch (err) {
      useAuthStore.setState({
        error: err instanceof Error ? err.message : "Request failed",
      });
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-logo">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 2 7 12 12 22 7 12 2" />
            <polyline points="2 17 12 22 22 17" />
            <polyline points="2 12 12 17 22 12" />
          </svg>
          <h1 className="auth-app-name">TrailForge</h1>
          <p className="auth-tagline">Self-hosted adventure GPS</p>
        </div>

        {mode !== "forgot" && (
          <div className="auth-tabs">
            <button
              className={`auth-tab ${mode === "login" ? "active" : ""}`}
              onClick={() => switchMode("login")}
              type="button"
            >
              Sign In
            </button>
            <button
              className={`auth-tab ${mode === "register" ? "active" : ""}`}
              onClick={() => switchMode("register")}
              type="button"
            >
              Register
            </button>
          </div>
        )}

        {mode === "forgot" && (
          <p className="auth-forgot-title">Reset your password</p>
        )}

        {error && <div className="auth-error">{error}</div>}
        {forgotMessage && <div className="auth-success">{forgotMessage}</div>}

        {mode === "forgot" ? (
          <form onSubmit={handleForgotPassword} className="auth-form">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="auth-input"
              required
              autoComplete="email"
            />
            <button type="submit" className="auth-submit" disabled={forgotLoading}>
              {forgotLoading ? "Sending\u2026" : "Send Reset Link"}
            </button>
            <p className="auth-hint">
              <button
                className="auth-switch"
                onClick={() => switchMode("login")}
                type="button"
              >
                Back to Sign In
              </button>
            </p>
          </form>
        ) : (
          <>
            <form onSubmit={handleSubmit} className="auth-form">
              {mode === "register" && (
                <input
                  type="text"
                  placeholder="Display name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="auth-input"
                  required
                  autoComplete="name"
                />
              )}
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="auth-input"
                required
                autoComplete="email"
              />
              <input
                type="password"
                placeholder={mode === "register" ? "Password (min 8 chars)" : "Password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="auth-input"
                required
                minLength={mode === "register" ? 8 : undefined}
                autoComplete={mode === "register" ? "new-password" : "current-password"}
              />
              <button type="submit" className="auth-submit" disabled={loading}>
                {loading
                  ? "Please wait\u2026"
                  : mode === "login"
                    ? "Sign In"
                    : "Create Account"}
              </button>
            </form>

            {mode === "login" && (
              <p className="auth-hint">
                <button
                  className="auth-switch"
                  onClick={() => switchMode("forgot")}
                  type="button"
                >
                  Forgot password?
                </button>
              </p>
            )}

            <p className="auth-hint">
              {mode === "login"
                ? "Don\u2019t have an account? "
                : "Already have an account? "}
              <button
                className="auth-switch"
                onClick={() => switchMode(mode === "login" ? "register" : "login")}
                type="button"
              >
                {mode === "login" ? "Register" : "Sign in"}
              </button>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

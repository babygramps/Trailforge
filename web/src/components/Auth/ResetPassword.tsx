import { useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { apiClient } from "../../api/client";
import { useAuthStore } from "../../stores/authStore";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError("Missing reset token. Please use the link from the server logs.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const user = await apiClient.resetPassword(token, password);
      useAuthStore.setState({ user, error: null });
      setSuccess(true);
      setTimeout(() => navigate("/"), 1500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Reset failed";
      // Try to extract JSON message
      try {
        const parsed = JSON.parse(msg);
        setError(parsed.message || msg);
      } catch {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="auth-logo">
            <h1 className="auth-app-name">TrailForge</h1>
          </div>
          <div className="auth-error">
            Invalid reset link. Please request a new password reset.
          </div>
          <button
            className="auth-submit"
            onClick={() => navigate("/settings")}
          >
            Back to Settings
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-logo">
          <h1 className="auth-app-name">TrailForge</h1>
          <p className="auth-tagline">Set a new password</p>
        </div>

        {error && <div className="auth-error">{error}</div>}

        {success ? (
          <div className="auth-success">
            Password reset! Redirecting...
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="auth-form">
            <input
              type="password"
              placeholder="New password (min 8 chars)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="auth-input"
              required
              minLength={8}
              autoComplete="new-password"
            />
            <input
              type="password"
              placeholder="Confirm new password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="auth-input"
              required
              minLength={8}
              autoComplete="new-password"
            />
            <button type="submit" className="auth-submit" disabled={loading}>
              {loading ? "Resetting\u2026" : "Reset Password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

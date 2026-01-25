import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) {
      setError("Please enter both email and password");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.toLowerCase().trim(),
          password,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ detail: "Invalid email or password" }));
        throw new Error(data.detail || "Invalid email or password");
      }

      const response = await res.json();

      // Store token and user info
      localStorage.setItem("auth_token", response.access_token);
      localStorage.setItem("employee_id", response.employee_id);
      localStorage.setItem("employee_name", response.name);
      localStorage.setItem("company_id", response.company_id);

      // Navigate to employee schedule
      navigate("/employee/schedule");
    } catch (err: any) {
      setError(err?.message || "Invalid email or password");
    } finally {
      setLoading(false);
    }
  }

  const styles: Record<string, React.CSSProperties> = {
    page: {
      minHeight: "100vh",
      width: "100%",
      maxWidth: "100%",
      background: "#0b0f14",
      color: "#e9eaec",
      padding: 20,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    },
    container: {
      maxWidth: 400,
      width: "100%",
      padding: 24,
      backgroundColor: "#1a1a1a",
      borderRadius: 16,
      border: "1px solid #333",
    },
    title: {
      fontSize: 34,
      fontWeight: "800",
      color: "#e9eaec",
      marginBottom: 24,
      textAlign: "center",
    },
    label: {
      color: "#e9eaec",
      opacity: 0.8,
      marginBottom: 6,
      fontSize: 14,
    },
    input: {
      width: "100%",
      padding: 12,
      borderRadius: 10,
      border: "1px solid #444",
      backgroundColor: "#2a2a2a",
      color: "#e9eaec",
      fontSize: 16,
      marginBottom: 16,
    },
    button: {
      width: "100%",
      padding: 14,
      borderRadius: 16,
      backgroundColor: loading ? "#6b7280" : "#1f6feb",
      color: "white",
      fontWeight: "700",
      fontSize: 16,
      border: "none",
      cursor: loading ? "not-allowed" : "pointer",
      opacity: loading ? 0.5 : 1,
      marginBottom: 12,
    },
    error: {
      color: "#ff6b6b",
      fontSize: 14,
      marginBottom: 12,
      textAlign: "center",
    },
    helpText: {
      color: "#9aa4b2",
      fontSize: 12,
      textAlign: "center",
      marginTop: 20,
    },
  };

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.title}>Employee Login</div>

        {error && <div style={styles.error}>{error}</div>}

        <form onSubmit={handleLogin}>
          <div>
            <div style={styles.label}>Email</div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your.email@example.com"
              style={styles.input}
              disabled={loading}
              autoCapitalize="none"
            />
          </div>

          <div>
            <div style={styles.label}>Password</div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              style={styles.input}
              disabled={loading}
            />
          </div>

          <button type="submit" disabled={loading} style={styles.button}>
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>

        <div style={styles.helpText}>Contact your manager if you need to reset your password</div>
      </div>
    </div>
  );
}


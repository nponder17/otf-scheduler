import React from "react";
import { useNavigate } from "react-router-dom";

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    width: "100%",
    backgroundColor: "#0b0f14",
    color: "#e9eaec",
    padding: 20,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
  },
  container: {
    width: "100%",
    maxWidth: 600,
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#e9eaec",
    marginBottom: 20,
    textAlign: "center",
  },
  button: {
    padding: 14,
    borderRadius: 12,
    marginBottom: 12,
    border: "none",
    cursor: "pointer",
    fontWeight: "700",
    fontSize: 16,
    textAlign: "center",
    color: "white",
  },
  employeeButton: {
    backgroundColor: "#1f6feb",
  },
  managerButton: {
    backgroundColor: "#2563eb",
  },
  adminButton: {
    backgroundColor: "#7c3aed",
  },
};

export default function Home() {
  const navigate = useNavigate();

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.title}>Scheduler Mobile</div>

        <button
          onClick={() => navigate("/login")}
          style={{ ...styles.button, ...styles.employeeButton }}
        >
          Employee Login
        </button>

        <button
          onClick={() => navigate("/manager/login")}
          style={{ ...styles.button, ...styles.managerButton }}
        >
          Manager Login
        </button>

        <button
          onClick={() => navigate("/system-admin/login")}
          style={{ ...styles.button, ...styles.adminButton }}
        >
          System Admin Login
        </button>
      </div>
    </div>
  );
}


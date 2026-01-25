// apps/web/src/pages/AdminIndex.tsx
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000";

type Company = {
  company_id: string;
  name: string;
  timezone: string;
};

export default function AdminIndex() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [err, setErr] = useState<string>("");

  useEffect(() => {
    (async () => {
      try {
        setErr("");
        const token = localStorage.getItem("auth_token");
        const res = await fetch(`${API_BASE}/admin/companies`, {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });
        if (!res.ok) throw new Error("Failed to load companies");
        const data = await res.json();
        setCompanies(Array.isArray(data) ? data : []);
      } catch (e: any) {
        setErr(e?.message ?? "Failed to load companies");
      }
    })();
  }, []);

  const styles: Record<string, React.CSSProperties> = {
    page: {
      minHeight: "100vh",
      background: "#0b0f14",
      color: "#e9eaec",
      padding: 20,
    },
    title: {
      fontSize: 22,
      fontWeight: "700",
      marginBottom: 12,
    },
    error: {
      color: "crimson",
      marginBottom: 12,
    },
    list: {
      display: "flex",
      flexDirection: "column",
      gap: 10,
    },
    companyCard: {
      padding: 12,
      border: "1px solid #ddd",
      borderRadius: 10,
      textDecoration: "none",
      color: "inherit",
      display: "block",
      cursor: "pointer",
    },
    companyName: {
      fontWeight: "700",
    },
    companyTimezone: {
      opacity: 0.7,
      marginTop: 4,
    },
    companyId: {
      opacity: 0.6,
      fontSize: 12,
      marginTop: 4,
    },
  };

  return (
    <div style={styles.page}>
      <div style={{ maxWidth: "1400px", margin: "0 auto", width: "100%" }}>
        <div style={styles.title}>Admin</div>

      {!!err && <div style={styles.error}>{err}</div>}

      {companies.length === 0 ? (
        <div>No companies yet.</div>
      ) : (
        <div style={styles.list}>
          {companies.map((c) => (
            <Link key={c.company_id} to={`/admin/${c.company_id}`} style={styles.companyCard}>
              <div style={styles.companyName}>{c.name}</div>
              <div style={styles.companyTimezone}>{c.timezone}</div>
              <div style={styles.companyId}>{c.company_id}</div>
            </Link>
          ))}
        </div>
      )}
      </div>
    </div>
  );
}


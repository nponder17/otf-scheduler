// apps/web/src/pages/CompanyAdmin.tsx
import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000";
const WEB_BASE_RAW = import.meta.env.VITE_WEB_BASE || window.location.origin;
const WEB_BASE = WEB_BASE_RAW.replace(/\/+$/, "");

type Company = {
  company_id: string;
  name: string;
  timezone: string;
  logo_url?: string | null;
};

type Employee = {
  employee_id: string;
  company_id: string;
  name: string;
  email: string;
  phone: string | null;
  hire_date: string | null;
  is_active: boolean;
};

export default function CompanyAdmin() {
  const { companyId } = useParams<{ companyId: string }>();
  const companyIdStr = useMemo(() => String(companyId || ""), [companyId]);

  const isValidCompanyId = !!companyIdStr && companyIdStr !== "undefined";

  const [company, setCompany] = useState<Company | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [err, setErr] = useState<string>("");

  const [logoFailed, setLogoFailed] = useState(false);
  const [logoBust, setLogoBust] = useState<number>(Date.now());

  const [clearingForms, setClearingForms] = useState(false);
  const [clearingSchedule, setClearingSchedule] = useState(false);

  async function load() {
    try {
      setErr("");

      const [cRes, empsRes] = await Promise.all([
        fetch(`${API_BASE}/admin/companies/${companyIdStr}`),
        fetch(`${API_BASE}/admin/companies/${companyIdStr}/employees`),
      ]);

      if (!cRes.ok) throw new Error("Failed to load company");
      if (!empsRes.ok) throw new Error("Failed to load employees");

      const c = await cRes.json();
      const emps = await empsRes.json();

      setCompany((prev) => {
        if (!prev || prev.company_id !== c.company_id || prev.logo_url !== c.logo_url) {
          setLogoFailed(false);
          setLogoBust(Date.now());
        }
        return c;
      });

      setEmployees(Array.isArray(emps) ? emps : []);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load dashboard");
    }
  }

  useEffect(() => {
    if (!isValidCompanyId) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyIdStr]);

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      window.alert("Copied!");
    } catch {
      window.alert("Failed to copy");
    }
  }

  const title = company?.name || "Company Dashboard";
  const subtitle = company?.timezone || "";

  const proxiedLogoUrl = useMemo(() => {
    if (!isValidCompanyId) return "";
    return `${API_BASE}/admin/companies/${companyIdStr}/logo?bust=${logoBust}`;
  }, [companyIdStr, logoBust, isValidCompanyId]);

  const logoFileName = useMemo(() => {
    const raw = (company?.logo_url || "").trim();
    if (!raw) return "";
    try {
      const parts = raw.split("?")[0].split("#")[0].split("/");
      return parts[parts.length - 1] || "";
    } catch {
      return "";
    }
  }, [company?.logo_url]);

  const showLogo = isValidCompanyId && !!company && !logoFailed;

  async function clearAllFormSubmissions() {
    if (!isValidCompanyId) return;

    const ok = window.confirm(
      "This will delete ALL form submissions for this company:\n\n" +
        "- availability\n- unavailability\n- time off\n- PTO\n- submissions log\n\n" +
        "Employees will need to re-submit.\n\nContinue?"
    );

    if (!ok) return;

    try {
      setClearingForms(true);
      setErr("");

      const res = await fetch(`${API_BASE}/admin/companies/${companyIdStr}/forms/clear`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (!res.ok) throw new Error("Failed to clear forms");

      const data = await res.json();
      const deleted = data?.deleted ?? {};
      const total = data?.total_deleted ?? 0;

      window.alert(
        `Cleared form submissions ✅\n\nTotal rows deleted: ${total}\n` +
          Object.entries(deleted)
            .map(([k, v]) => `${k}: ${v}`)
            .join("\n")
      );

      await load();
    } catch (e: any) {
      setErr(e?.message ?? "Failed to clear forms");
    } finally {
      setClearingForms(false);
    }
  }

  async function clearScheduleArtifacts() {
    if (!isValidCompanyId) return;

    const ok = window.confirm(
      "This will delete ALL schedule artifacts for this company:\n\n" +
        "- schedule_runs\n- scheduled_shifts\n- audit tables\n\n" +
        "You can regenerate immediately.\n\nContinue?"
    );

    if (!ok) return;

    try {
      setClearingSchedule(true);
      setErr("");

      const res = await fetch(`${API_BASE}/admin/companies/${companyIdStr}/schedule/clear`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (!res.ok) throw new Error("Failed to clear schedule");

      const data = await res.json();
      const deleted = data?.deleted ?? {};

      window.alert(
        "Cleared schedule artifacts ✅\n\n" +
          Object.entries(deleted)
            .map(([k, v]) => `${k}: ${v}`)
            .join("\n")
      );
    } catch (e: any) {
      setErr(e?.message ?? "Failed to clear schedule");
    } finally {
      setClearingSchedule(false);
    }
  }

  const styles: Record<string, React.CSSProperties> = {
    page: {
      minHeight: "100vh",
      background: "#0b0f14",
      color: "#e9eaec",
      padding: 20,
    },
    header: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 8,
      marginBottom: 6,
    },
    logo: {
      maxWidth: 300,
      maxHeight: 200,
      objectFit: "contain",
    },
    logoPlaceholder: {
      width: 120,
      height: 120,
      borderRadius: 16,
      backgroundColor: "#111",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    },
    logoPlaceholderText: {
      color: "white",
      fontWeight: "900",
      fontSize: 42,
    },
    title: {
      fontSize: 26,
      fontWeight: "800",
      textAlign: "center",
    },
    subtitle: {
      opacity: 0.7,
      textAlign: "center",
    },
    logoFileName: {
      opacity: 0.55,
      fontSize: 12,
    },
    buttonRow: {
      display: "flex",
      flexDirection: "row",
      gap: 10,
      flexWrap: "wrap",
      marginBottom: 12,
    },
    button: {
      padding: 12,
      borderRadius: 10,
      border: "1px solid #ddd",
      backgroundColor: "#111",
      color: "white",
      fontWeight: "700",
      cursor: "pointer",
      textDecoration: "none",
      display: "inline-block",
    },
    buttonDisabled: {
      backgroundColor: "#6b7280",
      opacity: 0.7,
      cursor: "not-allowed",
    },
    buttonRefresh: {
      backgroundColor: "transparent",
      color: "#e9eaec",
    },
    buttonDanger: {
      backgroundColor: "#ef4444",
    },
    buttonWarning: {
      backgroundColor: "#f59e0b",
      color: "black",
    },
    error: {
      color: "crimson",
      marginBottom: 12,
    },
    employeeList: {
      display: "flex",
      flexDirection: "column",
      gap: 10,
    },
    employeeCard: {
      padding: 12,
      border: "1px solid #ddd",
      borderRadius: 10,
    },
    employeeName: {
      fontWeight: "700",
    },
    employeeEmail: {
      opacity: 0.8,
      marginTop: 4,
    },
    formLinkLabel: {
      fontSize: 12,
      opacity: 0.65,
      marginTop: 8,
    },
    formLink: {
      fontSize: 12,
      wordBreak: "break-all",
      marginTop: 4,
    },
    employeeActions: {
      display: "flex",
      flexDirection: "row",
      gap: 10,
      marginTop: 6,
    },
    actionButton: {
      padding: "10px 12px",
      borderRadius: 10,
      border: "1px solid #ddd",
      backgroundColor: "#2563eb",
      color: "white",
      fontWeight: "700",
      cursor: "pointer",
      textDecoration: "none",
      display: "inline-block",
    },
    actionButtonSecondary: {
      backgroundColor: "transparent",
      color: "#e9eaec",
    },
  };

  return (
    <div style={styles.page}>
      <div style={{ maxWidth: "1400px", margin: "0 auto", width: "100%" }}>
        <div style={styles.header}>
        {showLogo ? (
          <img
            src={proxiedLogoUrl}
            alt="Company logo"
            style={styles.logo}
            onError={() => setLogoFailed(true)}
          />
        ) : (
          <div style={styles.logoPlaceholder}>
            <div style={styles.logoPlaceholderText}>
              {company?.name?.slice(0, 1)?.toUpperCase() ?? "C"}
            </div>
          </div>
        )}

        <div style={styles.title}>{title}</div>
        {!!subtitle && <div style={styles.subtitle}>{subtitle}</div>}

        {!!logoFileName && <div style={styles.logoFileName}>Logo: {logoFileName}</div>}
      </div>

      <div style={styles.buttonRow}>
        <Link
          to={`/admin/${companyIdStr}/add`}
          style={{
            ...styles.button,
            ...(!isValidCompanyId ? styles.buttonDisabled : {}),
          }}
        >
          Add employee
        </Link>

        <Link
          to="/manager/schedule"
          style={{
            ...styles.button,
            backgroundColor: "#2563eb",
            ...(!isValidCompanyId ? styles.buttonDisabled : {}),
          }}
        >
          Schedule Generator
        </Link>

        <button
          onClick={() => {
            setLogoFailed(false);
            setLogoBust(Date.now());
            load();
          }}
          disabled={!isValidCompanyId}
          style={{
            ...styles.button,
            ...styles.buttonRefresh,
            ...(!isValidCompanyId ? styles.buttonDisabled : {}),
          }}
        >
          Refresh
        </button>

        <button
          onClick={clearAllFormSubmissions}
          disabled={clearingForms || !isValidCompanyId}
          style={{
            ...styles.button,
            ...styles.buttonDanger,
            ...(clearingForms || !isValidCompanyId ? styles.buttonDisabled : {}),
          }}
        >
          {clearingForms ? "Clearing forms..." : "Clear form submissions"}
        </button>

        <button
          onClick={clearScheduleArtifacts}
          disabled={clearingSchedule || !isValidCompanyId}
          style={{
            ...styles.button,
            ...styles.buttonWarning,
            ...(clearingSchedule || !isValidCompanyId ? styles.buttonDisabled : {}),
          }}
        >
          {clearingSchedule ? "Clearing schedule..." : "Clear schedule artifacts"}
        </button>
      </div>

      {!!err && <div style={styles.error}>{err}</div>}

      {!isValidCompanyId ? (
        <div style={styles.error}>
          Missing/invalid companyId in route. This page should be /admin/&lt;companyId&gt;
        </div>
      ) : employees.length === 0 ? (
        <div>No employees yet.</div>
      ) : (
        <div style={styles.employeeList}>
          {employees.map((e) => {
            const companyIdEncoded = encodeURIComponent(companyIdStr);
            const formPath = `/form/${e.employee_id}?companyId=${companyIdEncoded}`;
            const formUrl = `${WEB_BASE}${formPath}`;

            return (
              <div key={e.employee_id} style={styles.employeeCard}>
                <div style={styles.employeeName}>{e.name}</div>
                <div style={styles.employeeEmail}>{e.email}</div>

                <div style={styles.formLinkLabel}>Form link:</div>
                <div style={styles.formLink}>{formUrl}</div>

                <div style={styles.employeeActions}>
                  <button
                    onClick={() => copy(formUrl)}
                    style={styles.actionButton}
                  >
                    Copy link
                  </button>

                  <Link to={formPath} style={{ ...styles.actionButton, ...styles.actionButtonSecondary }}>
                    Open form
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


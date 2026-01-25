// apps/web/src/pages/AddEmployee.tsx
import React, { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000";

type EmployeeCreatePayload = {
  name: string;
  email: string;
  phone?: string | null;
  hire_date?: string | null;
};

type EmployeeOut = {
  employee_id: string;
  company_id: string;
  name: string;
  email: string;
  phone: string | null;
  hire_date: string | null;
  is_active: boolean;
  form_url?: string | null;
};

function notify(title: string, msg: string) {
  window.alert(`${title}\n\n${msg}`);
}

function isEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

function isISODate(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s.trim());
}

export default function AddEmployee() {
  const navigate = useNavigate();
  const { companyId } = useParams<{ companyId: string }>();
  const companyIdStr = useMemo(() => String(companyId || ""), [companyId]);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [hireDate, setHireDate] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<string>("");

  const [touched, setTouched] = useState({
    name: false,
    email: false,
    phone: false,
    hireDate: false,
  });

  const [fieldErrors, setFieldErrors] = useState<{
    name?: string;
    email?: string;
    hireDate?: string;
    general?: string;
  }>({});

  const [created, setCreated] = useState<EmployeeOut | null>(null);

  function validate(vals?: { name?: string; email?: string; hireDate?: string }) {
    const n = (vals?.name ?? name).trim();
    const e = (vals?.email ?? email).trim().toLowerCase();
    const hd = (vals?.hireDate ?? hireDate).trim();

    const errs: typeof fieldErrors = {};

    if (!companyIdStr || companyIdStr === "undefined") {
      errs.general = "Missing companyId in the route.";
      return errs;
    }

    if (!n) errs.name = "Name is required.";
    if (!e) errs.email = "Email is required.";
    else if (!isEmail(e)) errs.email = "Please enter a valid email address.";

    if (hd && !isISODate(hd))
      errs.hireDate = "Use YYYY-MM-DD (example: 2026-01-15).";

    return errs;
  }

  function markAllTouched() {
    setTouched({ name: true, email: true, phone: true, hireDate: true });
  }

  function formPathFromUrl(formUrl?: string | null) {
    if (!formUrl) return null;
    try {
      if (formUrl.startsWith("/")) return formUrl;
      const u = new URL(formUrl);
      return u.pathname + (u.search || "");
    } catch {
      return formUrl.replace("http://localhost:8081", "");
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      window.alert("Copied!");
    } catch {
      window.alert("Failed to copy");
    }
  }

  async function submit() {
    markAllTouched();

    const errs = validate();
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) {
      if (errs.general) notify("Invalid state", errs.general);
      return;
    }

    const payload: EmployeeCreatePayload = {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim() ? phone.trim() : null,
      hire_date: hireDate.trim() ? hireDate.trim() : null,
    };

    setSubmitting(true);
    setStatus("Creating employee...");
    setFieldErrors({});

    try {
      const res = await fetch(`${API_BASE}/admin/companies/${companyIdStr}/employees`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        const msg = data?.detail || "Failed to create employee";
        const lower = String(msg).toLowerCase();
        if (lower.includes("duplicate") || lower.includes("already exists")) {
          setFieldErrors((p) => ({
            ...p,
            email: "An employee with this email already exists.",
          }));
          setStatus("❌ Duplicate email.");
        } else {
          setFieldErrors((p) => ({ ...p, general: msg }));
          setStatus(`❌ ${msg}`);
        }
        notify("Create employee failed", msg);
        return;
      }

      const emp = await res.json();
      setCreated(emp);
      setStatus("✅ Employee created.");
    } catch (err: any) {
      const msg = err?.message || "Failed to create employee";
      setFieldErrors((p) => ({ ...p, general: msg }));
      setStatus(`❌ ${msg}`);
      notify("Create employee failed", msg);
    } finally {
      setSubmitting(false);
    }
  }

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
    subtitle: {
      opacity: 0.65,
      marginBottom: 12,
    },
    error: {
      color: "crimson",
      marginBottom: 12,
    },
    form: {
      display: "flex",
      flexDirection: "column",
      gap: 8,
      marginTop: 10,
    },
    label: {
      fontWeight: "700",
      marginTop: 8,
    },
    input: {
      border: "1px solid #ddd",
      borderRadius: 10,
      padding: 12,
      backgroundColor: "#0b0f14",
      color: "#e9eaec",
      marginTop: 4,
    },
    inputError: {
      borderColor: "crimson",
    },
    errorText: {
      color: "crimson",
      marginTop: 4,
      fontSize: 14,
    },
    buttonRow: {
      display: "flex",
      flexDirection: "row",
      gap: 10,
      marginTop: 10,
    },
    button: {
      flex: 1,
      padding: 12,
      borderRadius: 10,
      border: "1px solid #ddd",
      backgroundColor: "#111",
      color: "white",
      fontWeight: "700",
      cursor: "pointer",
    },
    buttonSecondary: {
      backgroundColor: "transparent",
      color: "#e9eaec",
    },
    buttonDisabled: {
      backgroundColor: "#999",
      opacity: 0.85,
      cursor: "not-allowed",
    },
    successBox: {
      marginTop: 6,
      padding: 12,
      border: "1px solid #ddd",
      borderRadius: 10,
    },
    successTitle: {
      fontWeight: "700",
      marginBottom: 8,
    },
    successLink: {
      fontSize: 12,
      wordBreak: "break-all",
      marginTop: 8,
    },
    status: {
      opacity: 0.75,
      marginTop: 10,
    },
  };

  // SUCCESS SCREEN
  if (created) {
    const formUrl = created.form_url ?? null;
    const formPath = formPathFromUrl(formUrl);

    return (
      <div style={styles.page}>
        <div style={styles.title}>Employee Created</div>
        <div style={styles.subtitle}>
          {created.name} • {created.email}
        </div>

        <div style={styles.successBox}>
          <div style={styles.successTitle}>Form link</div>
          {formUrl ? (
            <>
              <div style={styles.successLink}>{formUrl}</div>
              <div style={styles.buttonRow}>
                <button
                  style={styles.button}
                  onClick={() => copy(formUrl)}
                >
                  Copy link
                </button>
                <button
                  style={{ ...styles.button, ...styles.buttonSecondary }}
                  onClick={() => {
                    if (!formPath) return;
                    navigate(formPath);
                  }}
                  disabled={!formPath}
                >
                  Open form
                </button>
              </div>
            </>
          ) : (
            <div style={styles.error}>
              form_url missing from API response. (Backend should return it.)
            </div>
          )}
        </div>

        <div style={styles.buttonRow}>
          <button
            style={{ ...styles.button, ...styles.buttonSecondary }}
            onClick={() => {
              setCreated(null);
              setName("");
              setEmail("");
              setPhone("");
              setHireDate("");
              setStatus("");
              setTouched({ name: false, email: false, phone: false, hireDate: false });
              setFieldErrors({});
            }}
          >
            Add another
          </button>
          <button
            style={styles.button}
            onClick={() => navigate(`/admin/${companyIdStr}`)}
          >
            Back to dashboard
          </button>
        </div>

        {!!status && <div style={styles.status}>{status}</div>}
      </div>
    );
  }

  // FORM SCREEN
  const showNameErr = touched.name && !!fieldErrors.name;
  const showEmailErr = touched.email && !!fieldErrors.email;
  const showHireErr = touched.hireDate && !!fieldErrors.hireDate;

  return (
    <div style={styles.page}>
      <div style={{ maxWidth: "1400px", margin: "0 auto", width: "100%" }}>
        <div style={styles.title}>Add Employee</div>
      <div style={styles.subtitle}>Company: {companyIdStr}</div>

      {!!fieldErrors.general && <div style={styles.error}>{fieldErrors.general}</div>}

      <div style={styles.form}>
        <div style={styles.label}>Name *</div>
        <input
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (touched.name) setFieldErrors((p) => ({ ...p, ...validate({ name: e.target.value }) }));
          }}
          onBlur={() => setTouched((t) => ({ ...t, name: true }))}
          placeholder="Jane Coach"
          disabled={submitting}
          style={{
            ...styles.input,
            ...(showNameErr ? styles.inputError : {}),
          }}
        />
        {showNameErr && <div style={styles.errorText}>{fieldErrors.name}</div>}

        <div style={styles.label}>Email *</div>
        <input
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (touched.email) setFieldErrors((p) => ({ ...p, ...validate({ email: e.target.value }) }));
          }}
          onBlur={() => setTouched((t) => ({ ...t, email: true }))}
          placeholder="jane@otfroyaloak.com"
          disabled={submitting}
          style={{
            ...styles.input,
            ...(showEmailErr ? styles.inputError : {}),
          }}
        />
        {showEmailErr && <div style={styles.errorText}>{fieldErrors.email}</div>}

        <div style={styles.label}>Phone (optional)</div>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, phone: true }))}
          placeholder="248-555-1234"
          disabled={submitting}
          style={styles.input}
        />

        <div style={styles.label}>Hire Date (optional)</div>
        <input
          type="date"
          value={hireDate}
          onChange={(e) => {
            setHireDate(e.target.value);
            if (touched.hireDate)
              setFieldErrors((p) => ({ ...p, ...validate({ hireDate: e.target.value }) }));
          }}
          onBlur={() => setTouched((t) => ({ ...t, hireDate: true }))}
          disabled={submitting}
          style={{
            ...styles.input,
            ...(showHireErr ? styles.inputError : {}),
          }}
        />
        {showHireErr && <div style={styles.errorText}>{fieldErrors.hireDate}</div>}
      </div>

      <div style={styles.buttonRow}>
        <button
          style={{
            ...styles.button,
            ...styles.buttonSecondary,
            ...(submitting ? styles.buttonDisabled : {}),
          }}
          onClick={() => navigate(`/admin/${companyIdStr}`)}
          disabled={submitting}
        >
          Cancel
        </button>
        <button
          style={{
            ...styles.button,
            ...(submitting ? styles.buttonDisabled : {}),
          }}
          onClick={submit}
          disabled={submitting}
        >
          {submitting ? "Creating..." : "Create"}
        </button>
      </div>

      {!!status && <div style={styles.status}>{status}</div>}
      </div>
    </div>
  );
}


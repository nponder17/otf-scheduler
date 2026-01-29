// apps/web/src/pages/ManagerSchedule.tsx
import React, { useEffect, useMemo, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000";


type Company = { company_id: string; name: string };
type Studio = { studio_id: string; name: string };

type CoverageAssigned = { employee_id: string; name: string };

type CoverageRow = {
  shift_date: string; // "YYYY-MM-DD" (or ISO timestamp)
  label: string;
  start_time: string; // "HH:MM:SS"
  end_time: string; // "HH:MM:SS"
  required_count: number;
  scheduled_count: number;
  missing_count: number;

  // backend may return either:
  assigned_names?: string[];
  assigned?: CoverageAssigned[];

  // audit summary from schedule_audit_shift
  candidate_count?: number;
  rejection_summary?: Record<string, number>;
};

type CoverageResponse = {
  run: {
    schedule_run_id: string;
    company_id: string;
    studio_id: string;
    month_start: string;
    month_end: string;
  };
  coverage: CoverageRow[];
};

type AuditCandidate = {
  employee_id: string;
  name: string;
  eligible: boolean;
  rejection_reason: string | null;
  details: any; // jsonb
};

type AuditShiftResponse = {
  run_id: string;
  shift_date: string;
  label: string;
  start_time: string;
  end_time: string;
  candidates: AuditCandidate[];
};

type ScheduledShift = {
  scheduled_shift_id: string;
  shift_date: string;
  day_of_week: number;
  label: string;
  start_time: string;
  end_time: string;
  employee_id: string;
  employee_name: string;
};

type Employee = {
  employee_id: string;
  name: string;
  email: string;
};

const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

function parseISODate(s: string): Date {
  // Safe parse for YYYY-MM-DD
  return new Date(s + "T00:00:00");
}

function firstOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function lastOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function formatTime(t?: string) {
  return t ? t.slice(0, 5) : "";
}

function normalizeDateKey(s: string): string {
  if (!s) return s;
  return s.slice(0, 10);
}

function looksLikeUuid(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

function addDays(yyyyMMdd: string, delta: number) {
  const d = parseISODate(yyyyMMdd);
  d.setDate(d.getDate() + delta);
  return iso(d);
}

function startOfWeekMonday(yyyyMMdd: string) {
  const d = parseISODate(yyyyMMdd);
  // JS getDay(): Sun=0..Sat=6
  const js = d.getDay();
  const mondayFirstIndex = (js + 6) % 7; // Mon=0..Sun=6
  d.setDate(d.getDate() - mondayFirstIndex);
  return iso(d);
}

function endOfWeekMonday(yyyyMMdd: string) {
  return addDays(startOfWeekMonday(yyyyMMdd), 6);
}

function inRange(dateKey: string, start: string, end: string) {
  return dateKey >= start && dateKey <= end;
}

function sortedEntries(obj?: Record<string, number>) {
  if (!obj) return [];
  return Object.entries(obj).sort((a, b) => b[1] - a[1]);
}

type ViewMode = "month" | "day" | "week" | "twoWeek";

export default function ManagerSchedule() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [studios, setStudios] = useState<Studio[]>([]);

  const [companyId, setCompanyId] = useState("");
  const [studioId, setStudioId] = useState("");

  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth() + 1, 1);
  });

  const [overwrite, setOverwrite] = useState(true);
  const [generatorVersion, setGeneratorVersion] = useState<"v1" | "v2">("v2");
  const [runId, setRunId] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const [coverage, setCoverage] = useState<CoverageRow[]>([]);
  const [scheduledShifts, setScheduledShifts] = useState<ScheduledShift[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);

  // View state
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [anchorDate, setAnchorDate] = useState<string>(""); // YYYY-MM-DD

  // Audit modal state
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState("");
  const [auditData, setAuditData] = useState<AuditShiftResponse | null>(null);
  const [auditMeta, setAuditMeta] = useState<{
    shift_date: string;
    label: string;
    start_time: string;
    end_time: string;
    required_count: number;
    scheduled_count: number;
    missing_count: number;
    candidate_count?: number;
    rejection_summary?: Record<string, number>;
  } | null>(null);

  // Edit modal state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingShift, setEditingShift] = useState<ScheduledShift | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("");
  const [editLoading, setEditLoading] = useState(false);

  // Add shift modal state
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newShift, setNewShift] = useState({
    shift_date: "",
    label: "",
    start_time: "",
    end_time: "",
    employee_id: "",
  });
  const [addLoading, setAddLoading] = useState(false);

  // Responsive grid columns (fits screen)
  const [cols, setCols] = useState(7);
  useEffect(() => {
    const resize = () => {
      const w = window.innerWidth;
      setCols(w < 640 ? 1 : w < 900 ? 2 : w < 1200 ? 4 : 7);
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  const monthStart = useMemo(() => iso(firstOfMonth(month)), [month]);
  const monthEnd = useMemo(() => iso(lastOfMonth(month)), [month]);

  // initialize anchorDate to monthStart when month changes
  useEffect(() => {
    setAnchorDate(monthStart);
  }, [monthStart]);

  const canGenerate = looksLikeUuid(companyId) && looksLikeUuid(studioId) && !loading;

  // Load companies
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/companies`);
        const data = await res.json();
        setCompanies(Array.isArray(data) ? data : []);
      } catch {
        setCompanies([]);
      }
    })();
  }, []);

  // Load studios when company changes
  useEffect(() => {
    if (!looksLikeUuid(companyId)) {
      setStudios([]);
      setStudioId("");
      return;
    }

    (async () => {
      try {
        const res = await fetch(`${API_BASE}/companies/${companyId}/studios`);
        const data = await res.json();
        const arr = Array.isArray(data) ? data : [];
        setStudios(arr);
        setStudioId(arr.length ? arr[0].studio_id : "");
      } catch {
        setStudios([]);
        setStudioId("");
      }
    })();
  }, [companyId]);

  // Load employees when company changes
  useEffect(() => {
    if (!looksLikeUuid(companyId)) {
      setEmployees([]);
      return;
    }

    (async () => {
      try {
        const res = await fetch(`${API_BASE}/admin/companies/${companyId}/employees`);
        const data = await res.json();
        setEmployees(Array.isArray(data) ? data.filter((e: Employee) => e.employee_id) : []);
      } catch {
        setEmployees([]);
      }
    })();
  }, [companyId]);

  async function loadCoverageForRun(run: string) {
    const [covRes, shiftsRes] = await Promise.all([
      fetch(`${API_BASE}/schedules/${run}/coverage`),
      fetch(`${API_BASE}/schedules/${run}`),
    ]);

    const covJson = (await covRes.json()) as CoverageResponse | CoverageRow[];
    if (Array.isArray(covJson)) {
      setCoverage(covJson);
    } else {
      setCoverage(Array.isArray(covJson.coverage) ? covJson.coverage : []);
    }

    const shiftsJson = await shiftsRes.json();
    if (shiftsJson.shifts) {
      setScheduledShifts(Array.isArray(shiftsJson.shifts) ? shiftsJson.shifts : []);
    }
  }

  async function generate() {
    setMsg("");
    setCoverage([]);
    setRunId("");

    if (!looksLikeUuid(companyId) || !looksLikeUuid(studioId)) {
      setMsg("Select a valid Company + Studio first (UUIDs).");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/schedules/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: companyId,
          studio_id: studioId,
          month_start: monthStart,
          month_end: monthEnd,
          overwrite,
          generator_version: generatorVersion,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMsg(data?.detail ? JSON.stringify(data.detail) : JSON.stringify(data));
        return;
      }

      const newRunId = data?.schedule_run_id as string | undefined;
      if (!newRunId) {
        setMsg("Generate succeeded but no schedule_run_id returned.");
        return;
      }

      setRunId(newRunId);
      await loadCoverageForRun(newRunId);

      setMsg("Generated ✅");
    } catch (e: any) {
      setMsg(e?.message ?? "Generation failed");
    } finally {
      setLoading(false);
    }
  }

  // Group coverage by normalized YYYY-MM-DD
  const byDay = useMemo(() => {
    const m = new Map<string, CoverageRow[]>();
    for (const r of coverage) {
      const key = normalizeDateKey(r.shift_date);
      const arr = m.get(key) ?? [];
      arr.push(r);
      m.set(key, arr);
    }
    // Sort rows within each day by start_time
    for (const [k, arr] of m.entries()) {
      arr.sort((a, b) => a.start_time.localeCompare(b.start_time));
      m.set(k, arr);
    }
    return m;
  }, [coverage]);

  // Month grid cells (Monday-first)
  const monthCells = useMemo(() => {
    const start = new Date(monthStart + "T00:00:00");
    const end = new Date(monthEnd + "T00:00:00");
    const list: (string | null)[] = [];

    const pad = (start.getDay() + 6) % 7;
    for (let i = 0; i < pad; i++) list.push(null);

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      list.push(iso(new Date(d)));
    }

    while (list.length % cols !== 0) list.push(null);

    return list;
  }, [monthStart, monthEnd, cols]);

  // View range for list-style views
  const viewRange = useMemo(() => {
    const a = anchorDate || monthStart;

    if (viewMode === "day") {
      return { start: a, end: a };
    }
    if (viewMode === "week") {
      const start = startOfWeekMonday(a);
      return { start, end: endOfWeekMonday(a) };
    }
    if (viewMode === "twoWeek") {
      const start = startOfWeekMonday(a);
      return { start, end: addDays(start, 13) };
    }
    // month: entire month
    return { start: monthStart, end: monthEnd };
  }, [viewMode, anchorDate, monthStart, monthEnd]);

  const visibleDays = useMemo(() => {
    // Build list of day keys for list views
    const days: string[] = [];
    for (let d = viewRange.start; d <= viewRange.end; d = addDays(d, 1)) {
      days.push(d);
    }
    return days;
  }, [viewRange]);

  function moveWindow(delta: number) {
    // delta is in days for day/week/twoWeek navigation
    if (!anchorDate) return;
    setAnchorDate(addDays(anchorDate, delta));
  }

  function prev() {
    if (viewMode === "day") return moveWindow(-1);
    if (viewMode === "week") return moveWindow(-7);
    if (viewMode === "twoWeek") return moveWindow(-14);
    // month view: move month
    setMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1));
  }

  function next() {
    if (viewMode === "day") return moveWindow(1);
    if (viewMode === "week") return moveWindow(7);
    if (viewMode === "twoWeek") return moveWindow(14);
    // month view: move month
    setMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1));
  }

  function goToday() {
    const t = iso(new Date());
    // If today is not in current month, jump month too
    const td = parseISODate(t);
    setMonth(new Date(td.getFullYear(), td.getMonth(), 1));
    setAnchorDate(t);
  }

  async function openAuditForShift(r: CoverageRow) {
    if (!runId) {
      setMsg("No runId yet — generate first.");
      return;
    }

    const shift_date = normalizeDateKey(r.shift_date);
    const start_time = r.start_time; // "HH:MM:SS"
    const end_time = r.end_time;

    setAuditOpen(true);
    setAuditLoading(true);
    setAuditError("");
    setAuditData(null);

    setAuditMeta({
      shift_date,
      label: r.label,
      start_time,
      end_time,
      required_count: r.required_count ?? 0,
      scheduled_count: r.scheduled_count ?? 0,
      missing_count: r.missing_count ?? Math.max(0, (r.required_count ?? 0) - (r.scheduled_count ?? 0)),
      candidate_count: r.candidate_count,
      rejection_summary: r.rejection_summary,
    });

    try {
      const url =
        `${API_BASE}/schedules/${runId}/audit/shift` +
        `?shift_date=${encodeURIComponent(shift_date)}` +
        `&label=${encodeURIComponent(r.label)}` +
        `&start_time=${encodeURIComponent(start_time)}` +
        `&end_time=${encodeURIComponent(end_time)}`;

      const res = await fetch(url);
      const json = (await res.json()) as any;

      if (!res.ok) {
        setAuditError(json?.detail ? JSON.stringify(json.detail) : JSON.stringify(json));
        return;
      }

      setAuditData(json as AuditShiftResponse);
    } catch (e: any) {
      setAuditError(e?.message ?? "Failed to load audit");
    } finally {
      setAuditLoading(false);
    }
  }

  // Get scheduled shifts for a specific coverage row
  function getShiftsForCoverageRow(r: CoverageRow): ScheduledShift[] {
    const dateKey = normalizeDateKey(r.shift_date);
    return scheduledShifts.filter(
      (s) =>
        normalizeDateKey(s.shift_date) === dateKey &&
        s.label === r.label &&
        s.start_time === r.start_time &&
        s.end_time === r.end_time
    );
  }

  async function handleEditShift() {
    if (!editingShift || !selectedEmployeeId || !runId) return;

    setEditLoading(true);
    setMsg("");
    try {
      const res = await fetch(`${API_BASE}/schedules/shifts/${editingShift.scheduled_shift_id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employee_id: selectedEmployeeId }),
      });

      if (!res.ok) {
        const data = await res.json();
        setMsg(data?.detail ? JSON.stringify(data.detail) : "Failed to update shift");
        return;
      }

      setEditModalOpen(false);
      setEditingShift(null);
      setSelectedEmployeeId("");
      await loadCoverageForRun(runId);
      setMsg("Shift updated ✅");
    } catch (e: any) {
      setMsg(e?.message ?? "Failed to update shift");
    } finally {
      setEditLoading(false);
    }
  }

  async function handleDeleteShift(shiftId: string) {
    if (!runId) return;
    if (!confirm("Delete this shift assignment?")) return;

    setMsg("");
    try {
      const res = await fetch(`${API_BASE}/schedules/shifts/${shiftId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        setMsg(data?.detail ? JSON.stringify(data.detail) : "Failed to delete shift");
        return;
      }

      await loadCoverageForRun(runId);
      setMsg("Shift deleted ✅");
    } catch (e: any) {
      setMsg(e?.message ?? "Failed to delete shift");
    }
  }

  async function handleAddShift() {
    if (!runId || !newShift.shift_date || !newShift.label || !newShift.start_time || !newShift.end_time || !newShift.employee_id) {
      setMsg("Please fill in all fields");
      return;
    }

    setAddLoading(true);
    setMsg("");
    try {
      const res = await fetch(`${API_BASE}/schedules/shifts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schedule_run_id: runId,
          employee_id: newShift.employee_id,
          shift_date: newShift.shift_date,
          label: newShift.label,
          start_time: newShift.start_time,
          end_time: newShift.end_time,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setMsg(data?.detail ? JSON.stringify(data.detail) : "Failed to add shift");
        return;
      }

      setAddModalOpen(false);
      setNewShift({
        shift_date: "",
        label: "",
        start_time: "",
        end_time: "",
        employee_id: "",
      });
      await loadCoverageForRun(runId);
      setMsg("Shift added ✅");
    } catch (e: any) {
      setMsg(e?.message ?? "Failed to add shift");
    } finally {
      setAddLoading(false);
    }
  }

  function openEditModal(shift: ScheduledShift) {
    setEditingShift(shift);
    setSelectedEmployeeId(shift.employee_id);
    setEditModalOpen(true);
  }

  const styles: Record<string, React.CSSProperties> = {
    page: {
      minHeight: "100vh",
      background: "#0b0f14",
      color: "#e9eaec",
      padding: 18,
      overflowX: "hidden",
    },
    topRow: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: 12,
      flexWrap: "wrap",
      marginBottom: 10,
    },
    title: { fontSize: 34, fontWeight: 800, lineHeight: 1.05 },
    subtitle: { opacity: 0.7, marginTop: 6 },
    runId: { opacity: 0.8, fontSize: 14 },
    controls: {
      display: "flex",
      gap: 12,
      flexWrap: "wrap",
      alignItems: "end",
      marginTop: 10,
      marginBottom: 12,
    },
    label: { fontSize: 14, opacity: 0.8, marginBottom: 6 },
    select: {
      minWidth: 280,
      maxWidth: "100%",
      padding: "10px 12px",
      borderRadius: 14,
      border: "1px solid rgba(255,255,255,0.12)",
      background: "rgba(255,255,255,0.06)",
      color: "#e9eaec",
      outline: "none",
    },
    month: {
      minWidth: 210,
      padding: "10px 12px",
      borderRadius: 14,
      border: "1px solid rgba(255,255,255,0.12)",
      background: "rgba(255,255,255,0.06)",
      color: "#e9eaec",
      outline: "none",
    },
    btn: {
      padding: "10px 16px",
      borderRadius: 16,
      border: "1px solid rgba(255,255,255,0.14)",
      background: "rgba(255,255,255,0.08)",
      color: "#e9eaec",
      fontWeight: 700,
      cursor: "pointer",
      whiteSpace: "nowrap",
      opacity: 1,
    },
    btnDisabled: {
      opacity: 0.45,
      cursor: "not-allowed",
    },
    segmented: {
      display: "inline-flex",
      borderRadius: 14,
      border: "1px solid rgba(255,255,255,0.12)",
      overflow: "hidden",
      background: "rgba(255,255,255,0.04)",
    },
    segBtn: {
      padding: "8px 12px",
      fontSize: 13,
      fontWeight: 800,
      border: "none",
      background: "transparent",
      color: "rgba(233,234,236,0.85)",
      cursor: "pointer",
    },
    segActive: {
      background: "rgba(255,255,255,0.10)",
      color: "#e9eaec",
    },
    navRow: {
      display: "flex",
      gap: 10,
      alignItems: "center",
      flexWrap: "wrap",
      marginBottom: 10,
    },
    gridHeader: {
      display: "grid",
      gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
      gap: 12,
      marginTop: 10,
      marginBottom: 10,
      paddingLeft: 2,
    },
    weekday: { opacity: 0.7, fontSize: 14, paddingLeft: 8 },
    grid: {
      display: "grid",
      gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
      gap: 12,
    },
    dayCard: {
      minWidth: 0,
      borderRadius: 18,
      border: "1px solid rgba(255,255,255,0.08)",
      background: "rgba(255,255,255,0.05)",
      padding: 12,
      boxShadow: "0 10px 30px rgba(0,0,0,0.25) inset",
    },
    dayTop: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 8,
      marginBottom: 10,
    },
    dayNum: { fontSize: 22, fontWeight: 800 },
    chip: {
      fontSize: 13,
      fontWeight: 700,
      padding: "6px 10px",
      borderRadius: 999,
      border: "1px solid rgba(255,255,255,0.12)",
      background: "rgba(255,255,255,0.04)",
      whiteSpace: "nowrap",
    },
    chipGreen: { border: "1px solid rgba(0,255,128,0.28)", color: "#bfffdc" },
    chipRed: { border: "1px solid rgba(255,70,70,0.30)", color: "#ffd0d0" },
    shift: {
      borderRadius: 16,
      border: "1px solid rgba(255,255,255,0.08)",
      background: "rgba(0,0,0,0.25)",
      padding: 12,
      marginBottom: 10,
      cursor: "pointer",
    },
    time: { fontSize: 18, fontWeight: 800 },
    metaRow: {
      display: "flex",
      justifyContent: "space-between",
      gap: 10,
      alignItems: "center",
      marginTop: 6,
    },
    small: { opacity: 0.75, fontSize: 12 },
    pill: {
      fontSize: 12,
      fontWeight: 800,
      padding: "5px 10px",
      borderRadius: 999,
      border: "1px solid rgba(255,255,255,0.12)",
      background: "rgba(255,255,255,0.04)",
      whiteSpace: "nowrap",
    },
    pillGreen: { border: "1px solid rgba(0,255,128,0.35)", color: "#bfffdc" },
    pillRed: { border: "1px solid rgba(255,70,70,0.35)", color: "#ffd0d0" },
    who: {
      marginTop: 8,
      display: "flex",
      flexWrap: "wrap",
      gap: 8,
    },
    name: {
      fontSize: 13,
      padding: "6px 10px",
      borderRadius: 999,
      border: "1px solid rgba(255,255,255,0.10)",
      background: "rgba(255,255,255,0.04)",
      maxWidth: "100%",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    },
    listWrap: {
      display: "flex",
      flexDirection: "column",
      gap: 12,
      marginTop: 10,
    },
    dayListCard: {
      borderRadius: 18,
      border: "1px solid rgba(255,255,255,0.08)",
      background: "rgba(255,255,255,0.05)",
      padding: 14,
    },
    overlay: {
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.60)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 16,
      zIndex: 999,
    },
    modal: {
      width: "min(920px, 100%)",
      borderRadius: 18,
      border: "1px solid rgba(255,255,255,0.10)",
      background: "#0f1115",
      padding: 16,
      maxHeight: "85vh",
      overflow: "auto",
      boxShadow: "0 30px 80px rgba(0,0,0,0.55)",
    },
    modalTop: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: 10,
      marginBottom: 10,
    },
    modalTitle: { fontSize: 18, fontWeight: 900 },
    closeBtn: {
      border: "1px solid rgba(255,255,255,0.14)",
      background: "rgba(255,255,255,0.06)",
      color: "#e9eaec",
      borderRadius: 12,
      padding: "8px 10px",
      cursor: "pointer",
      fontWeight: 800,
    },
    sectionTitle: { fontSize: 14, fontWeight: 900, marginTop: 14, marginBottom: 8, opacity: 0.9 },
    row: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
      padding: "10px 10px",
      borderRadius: 14,
      border: "1px solid rgba(255,255,255,0.08)",
      background: "rgba(255,255,255,0.04)",
      marginBottom: 8,
    },
    badge: {
      fontSize: 12,
      fontWeight: 900,
      padding: "6px 10px",
      borderRadius: 999,
      border: "1px solid rgba(255,255,255,0.10)",
      background: "rgba(255,255,255,0.03)",
      whiteSpace: "nowrap",
      opacity: 0.9,
    },
    badgeGreen: { border: "1px solid rgba(0,255,128,0.35)", color: "#bfffdc" },
    badgeRed: { border: "1px solid rgba(255,70,70,0.35)", color: "#ffd0d0" },
  };

  // render helper: shift card
  function ShiftCard({ d, r, index }: { d: string; r: CoverageRow; index: number }) {
    const req = r.required_count ?? 0;
    const sched = r.scheduled_count ?? 0;
    const miss = Math.max(0, req - sched);

    const names =
      Array.isArray(r.assigned_names) && r.assigned_names.length
        ? r.assigned_names
        : Array.isArray(r.assigned) && r.assigned.length
        ? r.assigned.map((a) => a.name)
        : [];

    const candCount = typeof r.candidate_count === "number" ? r.candidate_count : undefined;
    const rejSummary = r.rejection_summary;

    const shiftsForThisRow = getShiftsForCoverageRow(r);

    return (
      <div
        key={`${d}-${r.label}-${index}`}
        style={styles.shift}
      >
        <div style={styles.metaRow}>
          <div style={styles.time}>
            {formatTime(r.start_time)} – {formatTime(r.end_time)}
          </div>
          <div style={{ ...styles.pill, ...(miss === 0 ? styles.pillGreen : styles.pillRed) }}>
            {sched}/{req}
          </div>
        </div>

        <div style={{ ...styles.small, marginTop: 4 }}>{r.label}</div>

        <div style={{ ...styles.small, marginTop: 6, display: "flex", gap: 10, flexWrap: "wrap" }}>
          {typeof candCount === "number" && <span>candidates: <strong>{candCount}</strong></span>}
          {rejSummary && Object.keys(rejSummary).length > 0 && (
            <span>top reject: <strong>{sortedEntries(rejSummary)[0]?.[0]}</strong></span>
          )}
          <span
            style={{ opacity: 0.65, cursor: "pointer", textDecoration: "underline" }}
            onClick={(e) => {
              e.stopPropagation();
              openAuditForShift(r);
            }}
          >
            (view audit)
          </span>
        </div>

        <div style={styles.who}>
          {shiftsForThisRow.length > 0 ? (
            shiftsForThisRow.map((shift) => (
              <div
                key={shift.scheduled_shift_id}
                style={{
                  ...styles.name,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span title={shift.employee_name}>{shift.employee_name}</span>
                <div style={{ display: "flex", gap: 4 }}>
                  <button
                    style={{
                      fontSize: 11,
                      padding: "4px 8px",
                      borderRadius: 6,
                      border: "1px solid rgba(255,255,255,0.2)",
                      background: "rgba(37,99,235,0.3)",
                      color: "#e9eaec",
                      cursor: "pointer",
                      fontWeight: 700,
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      openEditModal(shift);
                    }}
                    title="Change employee"
                  >
                    Edit
                  </button>
                  <button
                    style={{
                      fontSize: 11,
                      padding: "4px 8px",
                      borderRadius: 6,
                      border: "1px solid rgba(255,255,255,0.2)",
                      background: "rgba(239,68,68,0.3)",
                      color: "#e9eaec",
                      cursor: "pointer",
                      fontWeight: 700,
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteShift(shift.scheduled_shift_id);
                    }}
                    title="Delete assignment"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))
          ) : names.length > 0 ? (
            names.map((n) => (
              <div key={n} style={styles.name} title={n}>
                {n}
              </div>
            ))
          ) : (
            <div style={{ opacity: 0.6 }}>(none assigned)</div>
          )}
        </div>

        {miss > 0 && runId && (
          <button
            style={{
              marginTop: 8,
              padding: "6px 12px",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.2)",
              background: "rgba(34,197,94,0.2)",
              color: "#e9eaec",
              cursor: "pointer",
              fontWeight: 700,
              fontSize: 12,
              width: "100%",
            }}
            onClick={(e) => {
              e.stopPropagation();
              setNewShift({
                shift_date: normalizeDateKey(r.shift_date),
                label: r.label,
                start_time: r.start_time.substring(0, 5),
                end_time: r.end_time.substring(0, 5),
                employee_id: "",
              });
              setAddModalOpen(true);
            }}
          >
            + Add Assignment
          </button>
        )}
      </div>
    );
  }

  // Audit modal rendering
  const auditEligible = useMemo(() => {
    const c = auditData?.candidates ?? [];
    const eligible = c.filter((x) => x.eligible);
    // Put selected=true first if available
    eligible.sort((a, b) => {
      const as = !!a.details?.selected;
      const bs = !!b.details?.selected;
      if (as === bs) return a.name.localeCompare(b.name);
      return as ? -1 : 1;
    });
    return eligible;
  }, [auditData]);

  const auditRejected = useMemo(() => {
    const c = auditData?.candidates ?? [];
    const rej = c.filter((x) => !x.eligible);
    rej.sort((a, b) => {
      const ar = a.rejection_reason ?? "";
      const br = b.rejection_reason ?? "";
      if (ar === br) return a.name.localeCompare(b.name);
      return ar.localeCompare(br);
    });
    return rej;
  }, [auditData]);

  const auditRejectedGrouped = useMemo(() => {
    const groups = new Map<string, AuditCandidate[]>();
    for (const r of auditRejected) {
      const key = r.rejection_reason ?? "unknown";
      const arr = groups.get(key) ?? [];
      arr.push(r);
      groups.set(key, arr);
    }
    return Array.from(groups.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [auditRejected]);

  // Header label for view range
  const rangeLabel = useMemo(() => {
    if (viewMode === "month") {
      return `${month.toLocaleString(undefined, { month: "long", year: "numeric" })} · ${monthStart} → ${monthEnd}`;
    }
    if (viewMode === "day") {
      return `${viewRange.start} (${weekdays[(parseISODate(viewRange.start).getDay() + 6) % 7]})`;
    }
    if (viewMode === "week") {
      return `Week · ${viewRange.start} → ${viewRange.end}`;
    }
    return `2 Weeks · ${viewRange.start} → ${viewRange.end}`;
  }, [viewMode, month, monthStart, monthEnd, viewRange]);

  return (
    <div style={styles.page}>
      <div style={styles.topRow}>
        <div>
          <div style={styles.title}>Manager Schedule</div>
          <div style={styles.subtitle}>{rangeLabel}</div>
        </div>

        {runId && (
          <div style={styles.runId}>
            <strong>Run ID:</strong> {runId}
          </div>
        )}
      </div>

      {/* Navigation */}
      <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <a
          href="/admin"
          style={{
            padding: "10px 16px",
            borderRadius: 16,
            border: "1px solid rgba(255,255,255,0.14)",
            background: "rgba(255,255,255,0.08)",
            color: "#e9eaec",
            fontWeight: 700,
            textDecoration: "none",
            whiteSpace: "nowrap",
          }}
        >
          ← Admin Dashboard
        </a>
      </div>

      {/* Controls */}
      <div style={styles.controls}>
        <div>
          <div style={styles.label}>Company</div>
          <select style={styles.select} value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
            <option value="">-- select --</option>
            {companies.map((c) => (
              <option key={c.company_id} value={c.company_id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <div style={styles.label}>Studio</div>
          <select
            style={styles.select}
            value={studioId}
            onChange={(e) => setStudioId(e.target.value)}
            disabled={!looksLikeUuid(companyId) || studios.length === 0}
          >
            <option value="">-- select --</option>
            {studios.map((s) => (
              <option key={s.studio_id} value={s.studio_id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <div style={styles.label}>Month</div>
          <input
            style={styles.month}
            type="month"
            value={`${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`}
            onChange={(e) => {
              const [y, m] = e.target.value.split("-").map(Number);
              setMonth(new Date(y, m - 1, 1));
              setViewMode("month");
            }}
          />
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
          <span style={{ opacity: 0.85 }}>Overwrite</span>
        </label>

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", marginBottom: 4, opacity: 0.85, fontSize: 14 }}>
            Generator Version:
          </label>
          <select
            value={generatorVersion}
            onChange={(e) => setGeneratorVersion(e.target.value as "v1" | "v2")}
            style={{
              padding: "6px 10px",
              borderRadius: 6,
              border: "1px solid #444",
              backgroundColor: "#1a1a1a",
              color: "#e9eaec",
              fontSize: 14,
              width: "100%",
            }}
          >
            <option value="v1">v1 (Original - Simple)</option>
            <option value="v2">v2 (Enhanced - Hard/Soft Constraints)</option>
          </select>
        </div>

        <button
          style={{ ...styles.btn, ...(canGenerate ? {} : styles.btnDisabled) }}
          onClick={generate}
          disabled={!canGenerate}
          title={canGenerate ? "Generate schedule" : "Pick a company + studio first (valid UUIDs)"}
        >
          {loading ? "Generating..." : "Generate Schedule"}
        </button>

        {runId && (
          <button
            style={styles.btn}
            onClick={() => {
              setNewShift({
                shift_date: "",
                label: "",
                start_time: "",
                end_time: "",
                employee_id: "",
              });
              setAddModalOpen(true);
            }}
            title="Manually add a shift assignment"
          >
            + Add Shift
          </button>
        )}
      </div>

      {/* View + Navigation */}
      <div style={styles.navRow}>
        <div style={styles.segmented}>
          {(["month", "day", "week", "twoWeek"] as ViewMode[]).map((m) => (
            <button
              key={m}
              style={{ ...styles.segBtn, ...(viewMode === m ? styles.segActive : {}) }}
              onClick={() => setViewMode(m)}
            >
              {m === "twoWeek" ? "2-Week" : m[0].toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>

        <button style={styles.btn} onClick={prev}>
          ← Prev
        </button>
        <button style={styles.btn} onClick={next}>
          Next →
        </button>
        <button style={styles.btn} onClick={goToday}>
          Today
        </button>

        {viewMode !== "month" && (
          <div style={{ opacity: 0.75, fontSize: 13 }}>
            Anchor: <strong>{anchorDate || monthStart}</strong>
          </div>
        )}
      </div>

      {msg && <div style={{ marginBottom: 10, opacity: 0.9 }}>{msg}</div>}

      {/* MONTH VIEW */}
      {viewMode === "month" && (
        <>
          <div style={styles.gridHeader}>
            {Array.from({ length: cols }).map((_, i) => (
              <div key={i} style={styles.weekday}>
                {cols === 7 ? weekdays[i] : ""}
              </div>
            ))}
          </div>

          <div style={styles.grid}>
            {monthCells.map((d, idx) => {
              if (!d) {
                return <div key={idx} style={{ ...styles.dayCard, opacity: 0.25 }} />;
              }

              const dateObj = new Date(d + "T00:00:00");
              const dayNum = dateObj.getDate();

              const rows = byDay.get(d) ?? [];

              const requiredTotal = rows.reduce((sum, r) => sum + (r.required_count ?? 0), 0);
              const scheduledTotal = rows.reduce((sum, r) => sum + (r.scheduled_count ?? 0), 0);
              const missingTotal = Math.max(0, requiredTotal - scheduledTotal);

              const covered = requiredTotal > 0 ? missingTotal === 0 : true;

              return (
                <div
                  key={idx}
                  style={styles.dayCard}
                  onClick={() => {
                    setAnchorDate(d);
                    // optional: jump to day view quickly when clicking a day
                    // setViewMode("day");
                  }}
                  title="Click to set anchor date"
                >
                  <div style={styles.dayTop}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <div style={styles.dayNum}>{dayNum}</div>
                      <div style={{ opacity: 0.7, fontWeight: 700 }}>
                        ({weekdays[(dateObj.getDay() + 6) % 7]})
                      </div>
                    </div>

                    <div style={{ ...styles.chip, ...(covered ? styles.chipGreen : styles.chipRed) }}>
                      {covered ? "Covered" : `Missing ${missingTotal}`}
                    </div>
                  </div>

                  {rows.length === 0 ? (
                    <div style={{ opacity: 0.65 }}>(no shifts)</div>
                  ) : (
                    rows.map((r, i) => <ShiftCard key={`${d}-${i}`} d={d} r={r} index={i} />)
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* DAY / WEEK / 2-WEEK LIST VIEW */}
      {viewMode !== "month" && (
        <div style={styles.listWrap}>
          {visibleDays.map((d) => {
            // keep within current month range (optional)
            if (!inRange(d, monthStart, monthEnd)) {
              return (
                <div key={d} style={{ ...styles.dayListCard, opacity: 0.35 }}>
                  <div style={{ fontWeight: 900 }}>{d}</div>
                  <div style={{ opacity: 0.7 }}>(outside selected month)</div>
                </div>
              );
            }

            const rows = byDay.get(d) ?? [];
            const dow = weekdays[(parseISODate(d).getDay() + 6) % 7];

            const requiredTotal = rows.reduce((sum, r) => sum + (r.required_count ?? 0), 0);
            const scheduledTotal = rows.reduce((sum, r) => sum + (r.scheduled_count ?? 0), 0);
            const missingTotal = Math.max(0, requiredTotal - scheduledTotal);
            const covered = requiredTotal > 0 ? missingTotal === 0 : true;

            return (
              <div
                key={d}
                style={styles.dayListCard}
                onClick={() => setAnchorDate(d)}
                title="Click to set anchor date"
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 900 }}>
                      {d} <span style={{ opacity: 0.7 }}>({dow})</span>
                    </div>
                    <div style={{ opacity: 0.7, fontSize: 13 }}>
                      total: <strong>{scheduledTotal}</strong>/<strong>{requiredTotal}</strong>
                    </div>
                  </div>

                  <div style={{ ...styles.chip, ...(covered ? styles.chipGreen : styles.chipRed) }}>
                    {covered ? "Covered" : `Missing ${missingTotal}`}
                  </div>
                </div>

                <div style={{ marginTop: 10 }}>
                  {rows.length === 0 ? (
                    <div style={{ opacity: 0.65 }}>(no shifts)</div>
                  ) : (
                    rows.map((r, i) => <ShiftCard key={`${d}-${i}`} d={d} r={r} index={i} />)
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* AUDIT MODAL */}
      {auditOpen && (
        <div
          style={styles.overlay}
          onClick={() => {
            setAuditOpen(false);
            setAuditData(null);
            setAuditMeta(null);
            setAuditError("");
          }}
        >
          <div
            style={styles.modal}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={styles.modalTop}>
              <div>
                <div style={styles.modalTitle}>Shift Audit</div>
                {auditMeta && (
                  <div style={{ opacity: 0.8, marginTop: 6, fontSize: 13 }}>
                    <div>
                      <strong>{auditMeta.shift_date}</strong> · {auditMeta.label} ·{" "}
                      {formatTime(auditMeta.start_time)}–{formatTime(auditMeta.end_time)}
                    </div>
                    <div style={{ marginTop: 4 }}>
                      coverage:{" "}
                      <strong>
                        {auditMeta.scheduled_count}/{auditMeta.required_count}
                      </strong>{" "}
                      {auditMeta.missing_count > 0 ? (
                        <span style={{ color: "#ffd0d0" }}> (missing {auditMeta.missing_count})</span>
                      ) : (
                        <span style={{ color: "#bfffdc" }}> (covered)</span>
                      )}
                      {typeof auditMeta.candidate_count === "number" && (
                        <span> · candidates: <strong>{auditMeta.candidate_count}</strong></span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <button
                style={styles.closeBtn}
                onClick={() => {
                  setAuditOpen(false);
                  setAuditData(null);
                  setAuditMeta(null);
                  setAuditError("");
                }}
              >
                Close
              </button>
            </div>

            {auditLoading && <div style={{ opacity: 0.8 }}>Loading audit…</div>}
            {auditError && <div style={{ color: "#ffd0d0" }}>{auditError}</div>}

            {!auditLoading && !auditError && auditMeta?.rejection_summary && (
              <>
                <div style={styles.sectionTitle}>Rejection summary (counts)</div>
                {sortedEntries(auditMeta.rejection_summary).length === 0 ? (
                  <div style={{ opacity: 0.7 }}>(none)</div>
                ) : (
                  sortedEntries(auditMeta.rejection_summary).map(([reason, cnt]) => (
                    <div key={reason} style={styles.row}>
                      <div style={{ fontWeight: 800 }}>{reason}</div>
                      <div style={styles.badge}>{cnt}</div>
                    </div>
                  ))
                )}
              </>
            )}

            {!auditLoading && !auditError && (
              <>
                <div style={styles.sectionTitle}>Eligible</div>
                {auditEligible.length === 0 ? (
                  <div style={{ opacity: 0.7 }}>(none)</div>
                ) : (
                  auditEligible.map((c) => {
                    const selected = !!c.details?.selected;
                    return (
                      <div key={c.employee_id} style={styles.row}>
                        <div style={{ fontWeight: 900 }}>
                          {c.name}{" "}
                          <span style={{ opacity: 0.7, fontWeight: 700, fontSize: 12 }}>
                            ({c.employee_id.slice(0, 8)}…)
                          </span>
                        </div>
                        <div
                          style={{
                            ...styles.badge,
                            ...(selected ? styles.badgeGreen : {}),
                          }}
                          title={selected ? "Picked for this shift" : "Eligible but not selected (fairness, capacity, etc.)"}
                        >
                          {selected ? "SELECTED" : "ELIGIBLE"}
                        </div>
                      </div>
                    );
                  })
                )}

                <div style={styles.sectionTitle}>Rejected</div>
                {auditRejected.length === 0 ? (
                  <div style={{ opacity: 0.7 }}>(none)</div>
                ) : (
                  auditRejectedGrouped.map(([reason, people]) => (
                    <div key={reason} style={{ marginBottom: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div style={{ fontWeight: 900, opacity: 0.92 }}>{reason}</div>
                        <div style={{ ...styles.badge, ...styles.badgeRed }}>{people.length}</div>
                      </div>
                      <div style={{ marginTop: 8 }}>
                        {people.map((c) => (
                          <div key={c.employee_id} style={styles.row}>
                            <div style={{ fontWeight: 900 }}>
                              {c.name}{" "}
                              <span style={{ opacity: 0.7, fontWeight: 700, fontSize: 12 }}>
                                ({c.employee_id.slice(0, 8)}…)
                              </span>
                            </div>
                            <div style={{ ...styles.badge, ...styles.badgeRed }}>REJECTED</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* EDIT SHIFT MODAL */}
      {editModalOpen && editingShift && (
        <div
          style={styles.overlay}
          onClick={() => {
            setEditModalOpen(false);
            setEditingShift(null);
            setSelectedEmployeeId("");
          }}
        >
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalTop}>
              <div>
                <div style={styles.modalTitle}>Edit Shift Assignment</div>
                <div style={{ opacity: 0.8, marginTop: 6, fontSize: 13 }}>
                  {editingShift.shift_date} · {editingShift.label} · {formatTime(editingShift.start_time)}–{formatTime(editingShift.end_time)}
                </div>
              </div>
              <button
                style={styles.closeBtn}
                onClick={() => {
                  setEditModalOpen(false);
                  setEditingShift(null);
                  setSelectedEmployeeId("");
                }}
              >
                Close
              </button>
            </div>

            <div style={styles.sectionTitle}>Assign to:</div>
            <div style={{ maxHeight: "400px", overflowY: "auto", marginTop: 8 }}>
              {employees.map((emp) => (
                <div
                  key={emp.employee_id}
                  style={{
                    ...styles.row,
                    cursor: "pointer",
                    background: selectedEmployeeId === emp.employee_id ? "rgba(37,99,235,0.2)" : "rgba(255,255,255,0.04)",
                  }}
                  onClick={() => setSelectedEmployeeId(emp.employee_id)}
                >
                  <div style={{ fontWeight: 900 }}>
                    {emp.name} <span style={{ opacity: 0.7, fontSize: 12 }}>({emp.email})</span>
                  </div>
                  {selectedEmployeeId === emp.employee_id && (
                    <div style={{ ...styles.badge, ...styles.badgeGreen }}>SELECTED</div>
                  )}
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button
                style={styles.closeBtn}
                onClick={() => {
                  setEditModalOpen(false);
                  setEditingShift(null);
                  setSelectedEmployeeId("");
                }}
              >
                Cancel
              </button>
              <button
                style={{
                  ...styles.btn,
                  opacity: selectedEmployeeId && !editLoading ? 1 : 0.5,
                  cursor: selectedEmployeeId && !editLoading ? "pointer" : "not-allowed",
                }}
                onClick={handleEditShift}
                disabled={!selectedEmployeeId || editLoading}
              >
                {editLoading ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD SHIFT MODAL */}
      {addModalOpen && (
        <div
          style={styles.overlay}
          onClick={() => {
            setAddModalOpen(false);
            setNewShift({
              shift_date: "",
              label: "",
              start_time: "",
              end_time: "",
              employee_id: "",
            });
          }}
        >
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalTop}>
              <div>
                <div style={styles.modalTitle}>Add Shift Assignment</div>
                <div style={{ opacity: 0.8, marginTop: 6, fontSize: 13 }}>
                  {newShift.shift_date && `${newShift.shift_date} · ${newShift.label} · ${newShift.start_time}–${newShift.end_time}`}
                </div>
              </div>
              <button
                style={styles.closeBtn}
                onClick={() => {
                  setAddModalOpen(false);
                  setNewShift({
                    shift_date: "",
                    label: "",
                    start_time: "",
                    end_time: "",
                    employee_id: "",
                  });
                }}
              >
                Close
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <div style={styles.sectionTitle}>Date (YYYY-MM-DD)</div>
                <input
                  type="date"
                  value={newShift.shift_date}
                  onChange={(e) => setNewShift({ ...newShift, shift_date: e.target.value })}
                  style={styles.select}
                />
              </div>

              <div>
                <div style={styles.sectionTitle}>Label</div>
                <input
                  type="text"
                  value={newShift.label}
                  onChange={(e) => setNewShift({ ...newShift, label: e.target.value })}
                  placeholder="Morning Shift"
                  style={styles.select}
                />
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={styles.sectionTitle}>Start (HH:MM)</div>
                  <input
                    type="time"
                    value={newShift.start_time}
                    onChange={(e) => setNewShift({ ...newShift, start_time: e.target.value })}
                    style={styles.select}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={styles.sectionTitle}>End (HH:MM)</div>
                  <input
                    type="time"
                    value={newShift.end_time}
                    onChange={(e) => setNewShift({ ...newShift, end_time: e.target.value })}
                    style={styles.select}
                  />
                </div>
              </div>

              <div>
                <div style={styles.sectionTitle}>Assign to:</div>
                <div style={{ maxHeight: "300px", overflowY: "auto", marginTop: 8 }}>
                  {employees.map((emp) => (
                    <div
                      key={emp.employee_id}
                      style={{
                        ...styles.row,
                        cursor: "pointer",
                        background: newShift.employee_id === emp.employee_id ? "rgba(37,99,235,0.2)" : "rgba(255,255,255,0.04)",
                      }}
                      onClick={() => setNewShift({ ...newShift, employee_id: emp.employee_id })}
                    >
                      <div style={{ fontWeight: 900 }}>
                        {emp.name} <span style={{ opacity: 0.7, fontSize: 12 }}>({emp.email})</span>
                      </div>
                      {newShift.employee_id === emp.employee_id && (
                        <div style={{ ...styles.badge, ...styles.badgeGreen }}>SELECTED</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button
                style={styles.closeBtn}
                onClick={() => {
                  setAddModalOpen(false);
                  setNewShift({
                    shift_date: "",
                    label: "",
                    start_time: "",
                    end_time: "",
                    employee_id: "",
                  });
                }}
              >
                Cancel
              </button>
              <button
                style={{
                  ...styles.btn,
                  opacity: newShift.shift_date && newShift.label && newShift.start_time && newShift.end_time && newShift.employee_id && !addLoading ? 1 : 0.5,
                  cursor: newShift.shift_date && newShift.label && newShift.start_time && newShift.end_time && newShift.employee_id && !addLoading ? "pointer" : "not-allowed",
                }}
                onClick={handleAddShift}
                disabled={!newShift.shift_date || !newShift.label || !newShift.start_time || !newShift.end_time || !newShift.employee_id || addLoading}
              >
                {addLoading ? "Adding..." : "Add"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

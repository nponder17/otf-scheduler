// apps/mobile/app/manager/schedule.tsx
// Full ManagerSchedule implementation for mobile

import React, { useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, Pressable, Modal, TextInput, Alert, Platform } from "react-native";
import { apiGet, apiPost, apiPut, apiDelete, getApiBase } from "../../lib/api";

const API_BASE = getApiBase();

type Company = { company_id: string; name: string };
type Studio = { studio_id: string; name: string };

type CoverageAssigned = { employee_id: string; name: string };

type CoverageRow = {
  shift_date: string;
  label: string;
  start_time: string;
  end_time: string;
  required_count: number;
  scheduled_count: number;
  missing_count: number;
  assigned_names?: string[];
  assigned?: CoverageAssigned[];
  candidate_count?: number;
  rejection_summary?: Record<string, number>;
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

function inRange(d: string, start: string, end: string) {
  return d >= start && d <= end;
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
  const [runId, setRunId] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [coverage, setCoverage] = useState<CoverageRow[]>([]);
  const [scheduledShifts, setScheduledShifts] = useState<ScheduledShift[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [anchorDate, setAnchorDate] = useState<string>("");
  const [companyPickerOpen, setCompanyPickerOpen] = useState(false);
  const [studioPickerOpen, setStudioPickerOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editingShift, setEditingShift] = useState<ScheduledShift | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [editLoading, setEditLoading] = useState(false);
  const [newShift, setNewShift] = useState({
    shift_date: "",
    label: "",
    start_time: "",
    end_time: "",
    employee_id: "",
  });

  const monthStart = useMemo(() => iso(firstOfMonth(month)), [month]);
  const monthEnd = useMemo(() => iso(lastOfMonth(month)), [month]);

  useEffect(() => {
    setAnchorDate(monthStart);
  }, [monthStart]);

  const canGenerate = looksLikeUuid(companyId) && looksLikeUuid(studioId) && !loading;

  useEffect(() => {
    (async () => {
      try {
        const data = await apiGet<Company[]>("/companies");
        setCompanies(Array.isArray(data) ? data : []);
      } catch {
        setCompanies([]);
      }
    })();
  }, []);

  useEffect(() => {
    if (!looksLikeUuid(companyId)) {
      setStudios([]);
      setStudioId("");
      return;
    }
    (async () => {
      try {
        const data = await apiGet<Studio[]>(`/companies/${companyId}/studios`);
        const arr = Array.isArray(data) ? data : [];
        setStudios(arr);
        setStudioId(arr.length ? arr[0].studio_id : "");
      } catch {
        setStudios([]);
        setStudioId("");
      }
    })();
  }, [companyId]);

  useEffect(() => {
    if (!looksLikeUuid(companyId)) {
      setEmployees([]);
      return;
    }
    (async () => {
      try {
        const data = await apiGet<Employee[]>(`/admin/companies/${companyId}/employees`);
        setEmployees(Array.isArray(data) ? data.filter((e) => e.employee_id) : []);
      } catch {
        setEmployees([]);
      }
    })();
  }, [companyId]);

  async function loadCoverageForRun(run: string) {
    try {
      const [covData, shiftsData] = await Promise.all([
        apiGet<any>(`/schedules/${run}/coverage`),
        apiGet<any>(`/schedules/${run}`),
      ]);

      if (Array.isArray(covData)) {
        setCoverage(covData);
      } else {
        setCoverage(Array.isArray(covData.coverage) ? covData.coverage : []);
      }

      if (shiftsData.shifts) {
        setScheduledShifts(Array.isArray(shiftsData.shifts) ? shiftsData.shifts : []);
      }
    } catch (e: any) {
      setMsg(e?.message || "Failed to load schedule");
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
      const data = await apiPost<{ schedule_run_id: string }>("/schedules/generate", {
        company_id: companyId,
        studio_id: studioId,
        month_start: monthStart,
        month_end: monthEnd,
        overwrite,
      });

      const newRunId = data?.schedule_run_id;
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

    const cols = 7;
    while (list.length % cols !== 0) list.push(null);

    return list;
  }, [monthStart, monthEnd]);

  // View range for list-style views
  const viewRange = useMemo(() => {
    const a = anchorDate || monthStart;

    if (viewMode === "day") {
      return { start: a, end: a };
    }
    if (viewMode === "week") {
      const start = addDays(a, -((parseISODate(a).getDay() + 6) % 7));
      return { start, end: addDays(start, 6) };
    }
    if (viewMode === "twoWeek") {
      const start = addDays(a, -((parseISODate(a).getDay() + 6) % 7));
      return { start, end: addDays(start, 13) };
    }
    return { start: monthStart, end: monthEnd };
  }, [viewMode, anchorDate, monthStart, monthEnd]);

  const visibleDays = useMemo(() => {
    const days: string[] = [];
    const start = parseISODate(viewRange.start);
    const end = parseISODate(viewRange.end);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      days.push(iso(new Date(d)));
    }
    return days;
  }, [viewRange]);

  function prev() {
    if (viewMode === "month") {
      setMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1));
    } else {
      const delta = viewMode === "day" ? 1 : viewMode === "week" ? 7 : 14;
      setAnchorDate(addDays(anchorDate || monthStart, -delta));
    }
  }

  function next() {
    if (viewMode === "month") {
      setMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1));
    } else {
      const delta = viewMode === "day" ? 1 : viewMode === "week" ? 7 : 14;
      setAnchorDate(addDays(anchorDate || monthStart, delta));
    }
  }

  function goToday() {
    const t = iso(new Date());
    const td = parseISODate(t);
    setMonth(new Date(td.getFullYear(), td.getMonth(), 1));
    setAnchorDate(t);
  }

  function getShiftsForCoverageRow(r: CoverageRow): ScheduledShift[] {
    const key = normalizeDateKey(r.shift_date);
    return scheduledShifts.filter(
      (s) =>
        normalizeDateKey(s.shift_date) === key &&
        s.start_time === r.start_time &&
        s.end_time === r.end_time &&
        s.label === r.label
    );
  }

  function openEditModal(shift: ScheduledShift) {
    setEditingShift(shift);
    setSelectedEmployeeId(shift.employee_id);
    setEditModalOpen(true);
  }

  async function handleEditShift() {
    if (!editingShift || !selectedEmployeeId) return;

    setEditLoading(true);
    try {
      await apiPut(`/schedules/shifts/${editingShift.scheduled_shift_id}`, {
        employee_id: selectedEmployeeId,
      });

      await loadCoverageForRun(runId);
      setEditModalOpen(false);
      setEditingShift(null);
      setSelectedEmployeeId("");
      setMsg("Shift updated ✅");
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Failed to update shift");
    } finally {
      setEditLoading(false);
    }
  }

  async function handleDeleteShift(shiftId: string) {
    Alert.alert("Delete Shift", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await apiDelete(`/schedules/shifts/${shiftId}`);
            await loadCoverageForRun(runId);
            setMsg("Shift deleted ✅");
          } catch (e: any) {
            Alert.alert("Error", e?.message || "Failed to delete shift");
          }
        },
      },
    ]);
  }

  async function handleCreateShift() {
    if (!newShift.shift_date || !newShift.label || !newShift.start_time || !newShift.end_time || !newShift.employee_id) {
      Alert.alert("Error", "Please fill in all fields");
      return;
    }

    setEditLoading(true);
    try {
      await apiPost("/schedules/shifts", {
        schedule_run_id: runId,
        shift_date: newShift.shift_date,
        label: newShift.label,
        start_time: newShift.start_time,
        end_time: newShift.end_time,
        employee_id: newShift.employee_id,
      });

      await loadCoverageForRun(runId);
      setAddModalOpen(false);
      setNewShift({
        shift_date: "",
        label: "",
        start_time: "",
        end_time: "",
        employee_id: "",
      });
      setMsg("Shift added ✅");
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Failed to create shift");
    } finally {
      setEditLoading(false);
    }
  }

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

    const shiftsForThisRow = getShiftsForCoverageRow(r);

    return (
      <View
        style={{
          borderWidth: 1,
          borderColor: "#333",
          borderRadius: 12,
          padding: 10,
          marginTop: index > 0 ? 8 : 0,
          backgroundColor: "#1a1a1a",
        }}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <Text style={{ color: "#e9eaec", fontWeight: "700" }}>
            {formatTime(r.start_time)} – {formatTime(r.end_time)}
          </Text>
          <View
            style={{
              paddingHorizontal: 8,
              paddingVertical: 4,
              borderRadius: 8,
              backgroundColor: miss === 0 ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)",
            }}
          >
            <Text style={{ color: miss === 0 ? "#7ee787" : "#ff6b6b", fontWeight: "700", fontSize: 12 }}>
              {sched}/{req}
            </Text>
          </View>
        </View>

        <Text style={{ color: "#9aa4b2", fontSize: 12, marginBottom: 8 }}>{r.label}</Text>

        <View style={{ marginTop: 8 }}>
          {shiftsForThisRow.length > 0 ? (
            shiftsForThisRow.map((shift) => (
              <View
                key={shift.scheduled_shift_id}
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 6,
                  padding: 8,
                  backgroundColor: "#2a2a2a",
                  borderRadius: 8,
                }}
              >
                <Text style={{ color: "#e9eaec", flex: 1 }}>{shift.employee_name}</Text>
                <View style={{ flexDirection: "row", gap: 6 }}>
                  <Pressable
                    onPress={() => openEditModal(shift)}
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      borderRadius: 6,
                      backgroundColor: "rgba(37,99,235,0.3)",
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.2)",
                    }}
                  >
                    <Text style={{ color: "#e9eaec", fontSize: 11, fontWeight: "700" }}>Edit</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => handleDeleteShift(shift.scheduled_shift_id)}
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      borderRadius: 6,
                      backgroundColor: "rgba(239,68,68,0.3)",
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.2)",
                    }}
                  >
                    <Text style={{ color: "#e9eaec", fontSize: 11, fontWeight: "700" }}>×</Text>
                  </Pressable>
                </View>
              </View>
            ))
          ) : names.length > 0 ? (
            names.map((n, idx) => (
              <Text key={idx} style={{ color: "#e9eaec", marginBottom: 4 }}>
                {n}
              </Text>
            ))
          ) : (
            <Text style={{ color: "#9aa4b2", opacity: 0.6 }}>(none assigned)</Text>
          )}
        </View>

        {miss > 0 && runId && (
          <Pressable
            onPress={() => {
              setNewShift({
                shift_date: normalizeDateKey(r.shift_date),
                label: r.label,
                start_time: r.start_time.substring(0, 5),
                end_time: r.end_time.substring(0, 5),
                employee_id: "",
              });
              setAddModalOpen(true);
            }}
            style={{
              marginTop: 8,
              padding: 8,
              borderRadius: 8,
              backgroundColor: "rgba(34,197,94,0.2)",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.2)",
            }}
          >
            <Text style={{ color: "#e9eaec", fontWeight: "700", fontSize: 12, textAlign: "center" }}>
              + Add Assignment
            </Text>
          </Pressable>
        )}
      </View>
    );
  }

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
    <ScrollView
      style={{ flex: 1, backgroundColor: "#0b0f14" }}
      contentContainerStyle={{
        padding: 18,
        width: "100%",
        ...(Platform.OS === "web" ? { maxWidth: 600, alignSelf: "center" as const } : {}),
      }}
    >
      <Text style={{ fontSize: 34, fontWeight: "800", color: "#e9eaec", marginBottom: 6 }}>Manager Schedule</Text>
      <Text style={{ color: "#9aa4b2", fontSize: 14, marginBottom: 12 }}>{rangeLabel}</Text>

      {runId && (
        <Text style={{ color: "#9aa4b2", fontSize: 12, marginBottom: 12 }}>
          <Text style={{ fontWeight: "700" }}>Run ID:</Text> {runId}
        </Text>
      )}

      {/* Controls */}
      <View style={{ marginBottom: 16 }}>
        <View style={{ marginBottom: 12 }}>
          <Text style={{ color: "#e9eaec", opacity: 0.8, marginBottom: 6 }}>Company</Text>
          <Pressable
            onPress={() => setCompanyPickerOpen(true)}
            style={{
              padding: 12,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: "#444",
              backgroundColor: "#1a1a1a",
            }}
          >
            <Text style={{ color: companyId ? "#e9eaec" : "#888" }}>
              {companyId ? companies.find((c) => c.company_id === companyId)?.name || "Select company" : "Select company"}
            </Text>
          </Pressable>
        </View>

        <View style={{ marginBottom: 12 }}>
          <Text style={{ color: "#e9eaec", opacity: 0.8, marginBottom: 6 }}>Studio</Text>
          <Pressable
            onPress={() => setStudioPickerOpen(true)}
            disabled={!companyId || studios.length === 0}
            style={{
              padding: 12,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: "#444",
              backgroundColor: "#1a1a1a",
              opacity: !companyId || studios.length === 0 ? 0.5 : 1,
            }}
          >
            <Text style={{ color: studioId ? "#e9eaec" : "#888" }}>
              {studioId
                ? studios.find((s) => s.studio_id === studioId)?.name || "Select studio"
                : studios.length === 0
                ? "Select company first"
                : "Select studio"}
            </Text>
          </Pressable>
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12, gap: 8 }}>
          <Pressable
            onPress={() => setOverwrite(!overwrite)}
            style={{
              width: 24,
              height: 24,
              borderWidth: 2,
              borderColor: overwrite ? "#1f6feb" : "#444",
              backgroundColor: overwrite ? "#1f6feb" : "transparent",
              borderRadius: 4,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {overwrite && <Text style={{ color: "white", fontWeight: "900", fontSize: 14 }}>✓</Text>}
          </Pressable>
          <Text style={{ color: "#e9eaec", opacity: 0.85 }}>Overwrite</Text>
        </View>

        <Pressable
          onPress={generate}
          disabled={!canGenerate}
          style={{
            padding: 12,
            borderRadius: 16,
            backgroundColor: canGenerate ? "#1f6feb" : "#6b7280",
            opacity: canGenerate ? 1 : 0.5,
            marginBottom: 12,
          }}
        >
          <Text style={{ color: "white", fontWeight: "700", textAlign: "center" }}>
            {loading ? "Generating..." : "Generate Schedule"}
          </Text>
        </Pressable>

        {runId && (
          <Pressable
            onPress={() => {
              setNewShift({
                shift_date: "",
                label: "",
                start_time: "",
                end_time: "",
                employee_id: "",
              });
              setAddModalOpen(true);
            }}
            style={{
              padding: 12,
              borderRadius: 16,
              backgroundColor: "#2563eb",
              marginBottom: 12,
            }}
          >
            <Text style={{ color: "white", fontWeight: "700", textAlign: "center" }}>+ Add Shift</Text>
          </Pressable>
        )}
      </View>

      {/* View Mode + Navigation */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        {(["month", "day", "week", "twoWeek"] as ViewMode[]).map((m) => (
          <Pressable
            key={m}
            onPress={() => setViewMode(m)}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 8,
              backgroundColor: viewMode === m ? "#1f6feb" : "#2a2a2a",
              borderWidth: 1,
              borderColor: viewMode === m ? "#1f6feb" : "#444",
            }}
          >
            <Text style={{ color: "#e9eaec", fontWeight: viewMode === m ? "700" : "400", fontSize: 12 }}>
              {m === "twoWeek" ? "2-Week" : m[0].toUpperCase() + m.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        <Pressable
          onPress={prev}
          style={{
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 8,
            backgroundColor: "#2a2a2a",
            borderWidth: 1,
            borderColor: "#444",
          }}
        >
          <Text style={{ color: "#e9eaec", fontWeight: "700" }}>← Prev</Text>
        </Pressable>
        <Pressable
          onPress={next}
          style={{
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 8,
            backgroundColor: "#2a2a2a",
            borderWidth: 1,
            borderColor: "#444",
          }}
        >
          <Text style={{ color: "#e9eaec", fontWeight: "700" }}>Next →</Text>
        </Pressable>
        <Pressable
          onPress={goToday}
          style={{
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 8,
            backgroundColor: "#2a2a2a",
            borderWidth: 1,
            borderColor: "#444",
          }}
        >
          <Text style={{ color: "#e9eaec", fontWeight: "700" }}>Today</Text>
        </Pressable>
      </View>

      {!!msg && <Text style={{ color: "#e9eaec", marginBottom: 10 }}>{msg}</Text>}

      {/* MONTH VIEW */}
      {viewMode === "month" && (
        <View>
          <View style={{ flexDirection: "row", marginBottom: 8 }}>
            {weekdays.map((day) => (
              <View key={day} style={{ flex: 1, alignItems: "center" }}>
                <Text style={{ color: "#9aa4b2", fontWeight: "700", fontSize: 12 }}>{day}</Text>
              </View>
            ))}
          </View>

          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {monthCells.map((d, idx) => {
              if (!d) {
                return <View key={idx} style={{ width: "14.28%", aspectRatio: 1, padding: 4 }} />;
              }

              const dateObj = new Date(d + "T00:00:00");
              const dayNum = dateObj.getDate();
              const rows = byDay.get(d) ?? [];

              const requiredTotal = rows.reduce((sum, r) => sum + (r.required_count ?? 0), 0);
              const scheduledTotal = rows.reduce((sum, r) => sum + (r.scheduled_count ?? 0), 0);
              const missingTotal = Math.max(0, requiredTotal - scheduledTotal);
              const covered = requiredTotal > 0 ? missingTotal === 0 : true;

              return (
                <Pressable
                  key={idx}
                  onPress={() => setAnchorDate(d)}
                  style={{
                    width: "14.28%",
                    aspectRatio: 1,
                    padding: 4,
                    borderWidth: 1,
                    borderColor: "#333",
                    backgroundColor: "#1a1a1a",
                  }}
                >
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <Text style={{ color: "#e9eaec", fontWeight: "700", fontSize: 12 }}>{dayNum}</Text>
                    <View
                      style={{
                        paddingHorizontal: 4,
                        paddingVertical: 2,
                        borderRadius: 4,
                        backgroundColor: covered ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)",
                      }}
                    >
                      <Text style={{ color: covered ? "#7ee787" : "#ff6b6b", fontSize: 8, fontWeight: "700" }}>
                        {scheduledTotal}/{requiredTotal}
                      </Text>
                    </View>
                  </View>
                  <ScrollView style={{ maxHeight: 60 }}>
                    {rows.slice(0, 2).map((r, i) => (
                      <View key={i} style={{ marginBottom: 2 }}>
                        <Text style={{ color: "#9aa4b2", fontSize: 8 }} numberOfLines={1}>
                          {formatTime(r.start_time)} {r.label}
                        </Text>
                      </View>
                    ))}
                    {rows.length > 2 && <Text style={{ color: "#9aa4b2", fontSize: 8 }}>+{rows.length - 2} more</Text>}
                  </ScrollView>
                </Pressable>
              );
            })}
          </View>

          {/* Detailed day view when a day is selected */}
          {anchorDate && byDay.has(anchorDate) && (
            <View style={{ marginTop: 20, padding: 12, backgroundColor: "#1a1a1a", borderRadius: 12 }}>
              <Text style={{ color: "#e9eaec", fontWeight: "700", fontSize: 18, marginBottom: 12 }}>
                {anchorDate} ({weekdays[(parseISODate(anchorDate).getDay() + 6) % 7]})
              </Text>
              {byDay.get(anchorDate)?.map((r, i) => (
                <ShiftCard key={i} d={anchorDate} r={r} index={i} />
              ))}
            </View>
          )}
        </View>
      )}

      {/* DAY / WEEK / 2-WEEK LIST VIEW */}
      {viewMode !== "month" && (
        <View>
          {visibleDays.map((d) => {
            if (!inRange(d, monthStart, monthEnd)) {
              return (
                <View key={d} style={{ padding: 12, backgroundColor: "#1a1a1a", borderRadius: 12, marginBottom: 8, opacity: 0.35 }}>
                  <Text style={{ color: "#e9eaec", fontWeight: "900" }}>{d}</Text>
                  <Text style={{ color: "#9aa4b2", opacity: 0.7 }}>(outside selected month)</Text>
                </View>
              );
            }

            const rows = byDay.get(d) ?? [];
            const dow = weekdays[(parseISODate(d).getDay() + 6) % 7];
            const requiredTotal = rows.reduce((sum, r) => sum + (r.required_count ?? 0), 0);
            const scheduledTotal = rows.reduce((sum, r) => sum + (r.scheduled_count ?? 0), 0);
            const missingTotal = Math.max(0, requiredTotal - scheduledTotal);
            const covered = requiredTotal > 0 ? missingTotal === 0 : true;

            return (
              <Pressable
                key={d}
                onPress={() => setAnchorDate(d)}
                style={{
                  padding: 12,
                  backgroundColor: "#1a1a1a",
                  borderRadius: 12,
                  marginBottom: 8,
                }}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <View>
                    <Text style={{ color: "#e9eaec", fontWeight: "900", fontSize: 16 }}>
                      {d} <Text style={{ opacity: 0.7 }}>({dow})</Text>
                    </Text>
                    <Text style={{ color: "#9aa4b2", fontSize: 12, marginTop: 4 }}>
                      total: <Text style={{ fontWeight: "700" }}>{scheduledTotal}</Text>/
                      <Text style={{ fontWeight: "700" }}>{requiredTotal}</Text>
                    </Text>
                  </View>
                  <View
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      borderRadius: 8,
                      backgroundColor: covered ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)",
                    }}
                  >
                    <Text style={{ color: covered ? "#7ee787" : "#ff6b6b", fontWeight: "700", fontSize: 12 }}>
                      {covered ? "Covered" : `Missing ${missingTotal}`}
                    </Text>
                  </View>
                </View>

                {rows.length === 0 ? (
                  <Text style={{ color: "#9aa4b2", opacity: 0.65 }}>(no shifts)</Text>
                ) : (
                  rows.map((r, i) => <ShiftCard key={i} d={d} r={r} index={i} />)
                )}
              </Pressable>
            );
          })}
        </View>
      )}

      {/* EDIT SHIFT MODAL */}
      <Modal visible={editModalOpen} transparent={true} animationType="slide" onRequestClose={() => setEditModalOpen(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" }}>
          <View
            style={{
              backgroundColor: "#1a1a1a",
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              padding: 20,
              maxHeight: "80%",
            }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <View>
                <Text style={{ color: "#e9eaec", fontSize: 20, fontWeight: "700" }}>Edit Shift Assignment</Text>
                {editingShift && (
                  <Text style={{ color: "#9aa4b2", fontSize: 13, marginTop: 6 }}>
                    {editingShift.shift_date} · {editingShift.label} · {formatTime(editingShift.start_time)}–
                    {formatTime(editingShift.end_time)}
                  </Text>
                )}
              </View>
              <Pressable
                onPress={() => {
                  setEditModalOpen(false);
                  setEditingShift(null);
                  setSelectedEmployeeId("");
                }}
                style={{
                  padding: 8,
                  borderRadius: 8,
                  backgroundColor: "#444",
                }}
              >
                <Text style={{ color: "#e9eaec", fontWeight: "700" }}>Close</Text>
              </Pressable>
            </View>

            <Text style={{ color: "#e9eaec", fontWeight: "700", marginBottom: 8 }}>Assign to:</Text>
            <ScrollView style={{ maxHeight: 400 }}>
              {employees.map((emp) => (
                <Pressable
                  key={emp.employee_id}
                  onPress={() => setSelectedEmployeeId(emp.employee_id)}
                  style={{
                    padding: 12,
                    borderRadius: 8,
                    backgroundColor: selectedEmployeeId === emp.employee_id ? "rgba(37,99,235,0.2)" : "#2a2a2a",
                    marginBottom: 8,
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <View>
                    <Text style={{ color: "#e9eaec", fontWeight: "700" }}>{emp.name}</Text>
                    <Text style={{ color: "#9aa4b2", fontSize: 12 }}>{emp.email}</Text>
                  </View>
                  {selectedEmployeeId === emp.employee_id && (
                    <View
                      style={{
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                        borderRadius: 4,
                        backgroundColor: "rgba(34,197,94,0.2)",
                      }}
                    >
                      <Text style={{ color: "#7ee787", fontSize: 12, fontWeight: "700" }}>SELECTED</Text>
                    </View>
                  )}
                </Pressable>
              ))}
            </ScrollView>

            <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
              <Pressable
                onPress={() => {
                  setEditModalOpen(false);
                  setEditingShift(null);
                  setSelectedEmployeeId("");
                }}
                style={{
                  flex: 1,
                  padding: 12,
                  borderRadius: 8,
                  backgroundColor: "#444",
                  alignItems: "center",
                }}
              >
                <Text style={{ color: "#e9eaec", fontWeight: "700" }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleEditShift}
                disabled={!selectedEmployeeId || editLoading}
                style={{
                  flex: 1,
                  padding: 12,
                  borderRadius: 8,
                  backgroundColor: selectedEmployeeId && !editLoading ? "#1f6feb" : "#6b7280",
                  opacity: selectedEmployeeId && !editLoading ? 1 : 0.5,
                  alignItems: "center",
                }}
              >
                <Text style={{ color: "white", fontWeight: "700" }}>{editLoading ? "Saving..." : "Save"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ADD SHIFT MODAL */}
      <Modal visible={addModalOpen} transparent={true} animationType="slide" onRequestClose={() => setAddModalOpen(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" }}>
          <View
            style={{
              backgroundColor: "#1a1a1a",
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              padding: 20,
              maxHeight: "80%",
            }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <Text style={{ color: "#e9eaec", fontSize: 20, fontWeight: "700" }}>Add Shift Assignment</Text>
              <Pressable
                onPress={() => {
                  setAddModalOpen(false);
                  setNewShift({
                    shift_date: "",
                    label: "",
                    start_time: "",
                    end_time: "",
                    employee_id: "",
                  });
                }}
                style={{
                  padding: 8,
                  borderRadius: 8,
                  backgroundColor: "#444",
                }}
              >
                <Text style={{ color: "#e9eaec", fontWeight: "700" }}>Close</Text>
              </Pressable>
            </View>

            <View style={{ marginBottom: 12 }}>
              <Text style={{ color: "#e9eaec", fontWeight: "700", marginBottom: 6 }}>Date</Text>
              <TextInput
                value={newShift.shift_date}
                onChangeText={(text) => setNewShift({ ...newShift, shift_date: text })}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#888"
                style={{
                  padding: 12,
                  borderRadius: 8,
                  backgroundColor: "#2a2a2a",
                  color: "#e9eaec",
                  borderWidth: 1,
                  borderColor: "#444",
                }}
              />
            </View>

            <View style={{ marginBottom: 12 }}>
              <Text style={{ color: "#e9eaec", fontWeight: "700", marginBottom: 6 }}>Label</Text>
              <TextInput
                value={newShift.label}
                onChangeText={(text) => setNewShift({ ...newShift, label: text })}
                placeholder="e.g., Morning Shift"
                placeholderTextColor="#888"
                style={{
                  padding: 12,
                  borderRadius: 8,
                  backgroundColor: "#2a2a2a",
                  color: "#e9eaec",
                  borderWidth: 1,
                  borderColor: "#444",
                }}
              />
            </View>

            <View style={{ flexDirection: "row", gap: 10, marginBottom: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: "#e9eaec", fontWeight: "700", marginBottom: 6 }}>Start Time</Text>
                <TextInput
                  value={newShift.start_time}
                  onChangeText={(text) => setNewShift({ ...newShift, start_time: text })}
                  placeholder="09:00"
                  placeholderTextColor="#888"
                  style={{
                    padding: 12,
                    borderRadius: 8,
                    backgroundColor: "#2a2a2a",
                    color: "#e9eaec",
                    borderWidth: 1,
                    borderColor: "#444",
                  }}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: "#e9eaec", fontWeight: "700", marginBottom: 6 }}>End Time</Text>
                <TextInput
                  value={newShift.end_time}
                  onChangeText={(text) => setNewShift({ ...newShift, end_time: text })}
                  placeholder="17:00"
                  placeholderTextColor="#888"
                  style={{
                    padding: 12,
                    borderRadius: 8,
                    backgroundColor: "#2a2a2a",
                    color: "#e9eaec",
                    borderWidth: 1,
                    borderColor: "#444",
                  }}
                />
              </View>
            </View>

            <Text style={{ color: "#e9eaec", fontWeight: "700", marginBottom: 8 }}>Assign to:</Text>
            <ScrollView style={{ maxHeight: 200, marginBottom: 16 }}>
              {employees.map((emp) => (
                <Pressable
                  key={emp.employee_id}
                  onPress={() => setNewShift({ ...newShift, employee_id: emp.employee_id })}
                  style={{
                    padding: 12,
                    borderRadius: 8,
                    backgroundColor: newShift.employee_id === emp.employee_id ? "rgba(37,99,235,0.2)" : "#2a2a2a",
                    marginBottom: 8,
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <View>
                    <Text style={{ color: "#e9eaec", fontWeight: "700" }}>{emp.name}</Text>
                    <Text style={{ color: "#9aa4b2", fontSize: 12 }}>{emp.email}</Text>
                  </View>
                  {newShift.employee_id === emp.employee_id && (
                    <View
                      style={{
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                        borderRadius: 4,
                        backgroundColor: "rgba(34,197,94,0.2)",
                      }}
                    >
                      <Text style={{ color: "#7ee787", fontSize: 12, fontWeight: "700" }}>SELECTED</Text>
                    </View>
                  )}
                </Pressable>
              ))}
            </ScrollView>

            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable
                onPress={() => {
                  setAddModalOpen(false);
                  setNewShift({
                    shift_date: "",
                    label: "",
                    start_time: "",
                    end_time: "",
                    employee_id: "",
                  });
                }}
                style={{
                  flex: 1,
                  padding: 12,
                  borderRadius: 8,
                  backgroundColor: "#444",
                  alignItems: "center",
                }}
              >
                <Text style={{ color: "#e9eaec", fontWeight: "700" }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleCreateShift}
                disabled={editLoading}
                style={{
                  flex: 1,
                  padding: 12,
                  borderRadius: 8,
                  backgroundColor: editLoading ? "#6b7280" : "#1f6feb",
                  opacity: editLoading ? 0.5 : 1,
                  alignItems: "center",
                }}
              >
                <Text style={{ color: "white", fontWeight: "700" }}>{editLoading ? "Creating..." : "Create"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Company Picker Modal */}
      <Modal
        visible={companyPickerOpen}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setCompanyPickerOpen(false)}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" }}>
          <View
            style={{
              backgroundColor: "#1a1a1a",
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              padding: 20,
              maxHeight: "80%",
            }}
          >
            <Text style={{ color: "#e9eaec", fontSize: 20, fontWeight: "700", marginBottom: 16 }}>Select Company</Text>
            <ScrollView>
              {companies.map((c) => (
                <Pressable
                  key={c.company_id}
                  onPress={() => {
                    setCompanyId(c.company_id);
                    setCompanyPickerOpen(false);
                  }}
                  style={{
                    padding: 16,
                    borderRadius: 10,
                    backgroundColor: companyId === c.company_id ? "#2563eb" : "#2a2a2a",
                    marginBottom: 8,
                  }}
                >
                  <Text style={{ color: "#e9eaec", fontWeight: companyId === c.company_id ? "700" : "400" }}>
                    {c.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable
              onPress={() => setCompanyPickerOpen(false)}
              style={{
                marginTop: 16,
                padding: 12,
                borderRadius: 10,
                backgroundColor: "#444",
                alignItems: "center",
              }}
            >
              <Text style={{ color: "#e9eaec", fontWeight: "700" }}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Studio Picker Modal */}
      <Modal
        visible={studioPickerOpen}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setStudioPickerOpen(false)}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" }}>
          <View
            style={{
              backgroundColor: "#1a1a1a",
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              padding: 20,
              maxHeight: "80%",
            }}
          >
            <Text style={{ color: "#e9eaec", fontSize: 20, fontWeight: "700", marginBottom: 16 }}>Select Studio</Text>
            <ScrollView>
              {studios.map((s) => (
                <Pressable
                  key={s.studio_id}
                  onPress={() => {
                    setStudioId(s.studio_id);
                    setStudioPickerOpen(false);
                  }}
                  style={{
                    padding: 16,
                    borderRadius: 10,
                    backgroundColor: studioId === s.studio_id ? "#2563eb" : "#2a2a2a",
                    marginBottom: 8,
                  }}
                >
                  <Text style={{ color: "#e9eaec", fontWeight: studioId === s.studio_id ? "700" : "400" }}>
                    {s.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable
              onPress={() => setStudioPickerOpen(false)}
              style={{
                marginTop: 16,
                padding: 12,
                borderRadius: 10,
                backgroundColor: "#444",
                alignItems: "center",
              }}
            >
              <Text style={{ color: "#e9eaec", fontWeight: "700" }}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

// apps/mobile/app/manager/schedule.tsx
// This is a large file - ManagerSchedule converted to React Native
// Note: Full implementation would require converting all web components to React Native
// For now, creating a placeholder that matches the structure

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

  // NOTE: This is a simplified version. The full ManagerSchedule has:
  // - Complex calendar grid views
  // - Shift cards with edit/delete
  // - Audit modals
  // - Edit/Add shift modals
  // Full implementation would require converting all 1653 lines of web code to React Native

  return (
    <ScrollView style={{ flex: 1, backgroundColor: "#0b0c0e" }} contentContainerStyle={{ padding: 18 }}>
      <Text style={{ fontSize: 34, fontWeight: "800", color: "#e9eaec", marginBottom: 10 }}>
        Manager Schedule
      </Text>

      <View style={{ marginBottom: 12 }}>
        <Text style={{ color: "#e9eaec", opacity: 0.8, marginBottom: 6 }}>Company</Text>
        {/* TODO: Add Picker for companies */}
        <Text style={{ color: "#e9eaec" }}>Company selector (to be implemented)</Text>
      </View>

      <View style={{ marginBottom: 12 }}>
        <Text style={{ color: "#e9eaec", opacity: 0.8, marginBottom: 6 }}>Studio</Text>
        <Text style={{ color: "#e9eaec" }}>Studio selector (to be implemented)</Text>
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

      {!!msg && <Text style={{ color: "#e9eaec", marginBottom: 10 }}>{msg}</Text>}

      {coverage.length > 0 && (
        <View>
          <Text style={{ color: "#e9eaec", fontWeight: "700", marginTop: 12, marginBottom: 8 }}>
            Schedule Coverage
          </Text>
          <Text style={{ color: "#e9eaec", opacity: 0.7 }}>
            {coverage.length} shift instances loaded
          </Text>
          <Text style={{ color: "#e9eaec", opacity: 0.6, fontSize: 12, marginTop: 8 }}>
            Full calendar view and editing capabilities coming soon...
          </Text>
        </View>
      )}
    </ScrollView>
  );
}


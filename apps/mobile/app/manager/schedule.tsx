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
  const [companyPickerOpen, setCompanyPickerOpen] = useState(false);
  const [studioPickerOpen, setStudioPickerOpen] = useState(false);

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
    <ScrollView style={{ flex: 1, backgroundColor: "#0b0f14" }} contentContainerStyle={{ padding: 18 }}>
      <Text style={{ fontSize: 34, fontWeight: "800", color: "#e9eaec", marginBottom: 10 }}>
        Manager Schedule
      </Text>

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
            {companyId
              ? companies.find((c) => c.company_id === companyId)?.name || "Select company"
              : "Select company"}
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

      {/* Company Picker Modal */}
      <Modal
        visible={companyPickerOpen}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setCompanyPickerOpen(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.7)",
            justifyContent: "flex-end",
          }}
        >
          <View
            style={{
              backgroundColor: "#1a1a1a",
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              padding: 20,
              maxHeight: "80%",
            }}
          >
            <Text style={{ color: "#e9eaec", fontSize: 20, fontWeight: "700", marginBottom: 16 }}>
              Select Company
            </Text>
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
                  <Text
                    style={{
                      color: "#e9eaec",
                      fontWeight: companyId === c.company_id ? "700" : "400",
                    }}
                  >
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
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.7)",
            justifyContent: "flex-end",
          }}
        >
          <View
            style={{
              backgroundColor: "#1a1a1a",
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              padding: 20,
              maxHeight: "80%",
            }}
          >
            <Text style={{ color: "#e9eaec", fontSize: 20, fontWeight: "700", marginBottom: 16 }}>
              Select Studio
            </Text>
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
                  <Text
                    style={{
                      color: "#e9eaec",
                      fontWeight: studioId === s.studio_id ? "700" : "400",
                    }}
                  >
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


import React, { useEffect, useMemo, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Platform,
  TextInput,
  Modal,
  Alert,
} from "react-native";
import { apiGet, apiPost, apiPut, apiDelete } from "../../../../lib/api";

type ScheduleRun = {
  schedule_run_id: string;
  company_id: string;
  studio_id: string;
  month_start: string;
  month_end: string;
  created_at: string;
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

type ShiftInstance = {
  shift_date: string;
  label: string;
  start_time: string;
  end_time: string;
  required_count: number;
  scheduled_count: number;
  missing_count: number;
  assigned: Array<{ employee_id: string; name: string }>;
};

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function ScheduleEditor() {
  const router = useRouter();
  const { companyId, runId } = useLocalSearchParams<{ companyId: string; runId: string }>();
  const companyIdStr = useMemo(() => String(companyId || ""), [companyId]);
  const runIdStr = useMemo(() => String(runId || ""), [runId]);

  const [run, setRun] = useState<ScheduleRun | null>(null);
  const [shifts, setShifts] = useState<ScheduledShift[]>([]);
  const [coverage, setCoverage] = useState<ShiftInstance[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [err, setErr] = useState<string>("");
  const [loading, setLoading] = useState(false);

  // Edit modal state
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingShift, setEditingShift] = useState<ScheduledShift | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("");

  // Add shift modal state
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [newShift, setNewShift] = useState({
    shift_date: "",
    label: "",
    start_time: "",
    end_time: "",
    employee_id: "",
  });

  async function load() {
    if (!runIdStr || runIdStr === "undefined") return;

    try {
      setLoading(true);
      setErr("");

      const [scheduleData, coverageData, employeesData] = await Promise.all([
        apiGet<{ run: ScheduleRun; shifts: ScheduledShift[] }>(`/schedules/${runIdStr}`),
        apiGet<{ run: ScheduleRun; coverage: ShiftInstance[] }>(`/schedules/${runIdStr}/coverage`),
        apiGet<Employee[]>(`/admin/companies/${companyIdStr}/employees`),
      ]);

      setRun(scheduleData.run);
      setShifts(scheduleData.shifts);
      setCoverage(coverageData.coverage);
      setEmployees(employeesData.filter((e) => e.employee_id)); // Filter out any invalid entries
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load schedule");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runIdStr, companyIdStr]);

  function formatDate(dateStr: string) {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    } catch {
      return dateStr;
    }
  }

  function formatTime(timeStr: string) {
    // Handle both "HH:MM:SS" and "HH:MM" formats
    return timeStr.substring(0, 5);
  }

  function formatDateRange(start: string, end: string) {
    return `${formatDate(start)} - ${formatDate(end)}`;
  }

  async function handleEditShift() {
    if (!editingShift || !selectedEmployeeId) return;

    try {
      setErr("");
      await apiPut(`/schedules/shifts/${editingShift.scheduled_shift_id}`, {
        employee_id: selectedEmployeeId,
      });

      setEditModalVisible(false);
      setEditingShift(null);
      setSelectedEmployeeId("");
      await load();
    } catch (e: any) {
      setErr(e?.message ?? "Failed to update shift");
    }
  }

  async function handleDeleteShift(shiftId: string) {
    const ok =
      Platform.OS === "web"
        ? // @ts-ignore
          window.confirm("Delete this shift assignment?")
        : true;

    if (!ok) return;

    try {
      setErr("");
      await apiDelete(`/schedules/shifts/${shiftId}`);
      await load();
    } catch (e: any) {
      setErr(e?.message ?? "Failed to delete shift");
    }
  }

  async function handleAddShift() {
    if (!newShift.shift_date || !newShift.label || !newShift.start_time || !newShift.end_time || !newShift.employee_id) {
      setErr("Please fill in all fields");
      return;
    }

    try {
      setErr("");
      await apiPost(`/schedules/shifts`, {
        schedule_run_id: runIdStr,
        employee_id: newShift.employee_id,
        shift_date: newShift.shift_date,
        label: newShift.label,
        start_time: newShift.start_time,
        end_time: newShift.end_time,
      });

      setAddModalVisible(false);
      setNewShift({
        shift_date: "",
        label: "",
        start_time: "",
        end_time: "",
        employee_id: "",
      });
      await load();
    } catch (e: any) {
      setErr(e?.message ?? "Failed to add shift");
    }
  }

  function openEditModal(shift: ScheduledShift) {
    setEditingShift(shift);
    setSelectedEmployeeId(shift.employee_id);
    setEditModalVisible(true);
  }

  // Group shifts by date
  const shiftsByDate = useMemo(() => {
    const grouped = new Map<string, ScheduledShift[]>();
    shifts.forEach((shift) => {
      const date = shift.shift_date;
      if (!grouped.has(date)) {
        grouped.set(date, []);
      }
      grouped.get(date)!.push(shift);
    });
    return Array.from(grouped.entries()).sort();
  }, [shifts]);

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <Pressable
          onPress={() => router.back()}
          style={{
            padding: 8,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: "#ddd",
          }}
        >
          <Text style={{ fontWeight: "700" }}>← Back</Text>
        </Pressable>
        <Text style={{ fontSize: 22, fontWeight: "700" }}>Edit Schedule</Text>
      </View>

      {loading ? (
        <Text>Loading...</Text>
      ) : run ? (
        <>
          <View style={{ padding: 12, backgroundColor: "#f3f4f6", borderRadius: 10, gap: 4 }}>
            <Text style={{ fontWeight: "700" }}>Period: {formatDateRange(run.month_start, run.month_end)}</Text>
            <Text style={{ opacity: 0.7, fontSize: 12 }}>Created: {formatDate(run.created_at)}</Text>
            <Text style={{ opacity: 0.7, fontSize: 12 }}>{shifts.length} shift assignments</Text>
          </View>

          <Pressable
            onPress={() => setAddModalVisible(true)}
            style={{
              padding: 12,
              borderRadius: 10,
              backgroundColor: "#2563eb",
              alignItems: "center",
            }}
          >
            <Text style={{ color: "white", fontWeight: "700" }}>+ Add Shift</Text>
          </Pressable>

          {!!err && <Text style={{ color: "crimson" }}>{err}</Text>}

          {shiftsByDate.length === 0 ? (
            <Text style={{ opacity: 0.7 }}>No shifts scheduled yet.</Text>
          ) : (
            <View style={{ gap: 16 }}>
              {shiftsByDate.map(([date, dateShifts]) => (
                <View key={date} style={{ gap: 8 }}>
                  <Text style={{ fontWeight: "700", fontSize: 16, marginTop: 8 }}>
                    {formatDate(date)} ({DAYS[dateShifts[0]?.day_of_week ?? 0]})
                  </Text>
                  {dateShifts.map((shift) => (
                    <View
                      key={shift.scheduled_shift_id}
                      style={{
                        padding: 12,
                        borderWidth: 1,
                        borderColor: "#ddd",
                        borderRadius: 10,
                        gap: 6,
                      }}
                    >
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontWeight: "700" }}>{shift.label}</Text>
                          <Text style={{ opacity: 0.7 }}>
                            {formatTime(shift.start_time)} - {formatTime(shift.end_time)}
                          </Text>
                          <Text style={{ opacity: 0.8, marginTop: 4 }}>{shift.employee_name}</Text>
                        </View>
                      </View>
                      <View style={{ flexDirection: "row", gap: 10, marginTop: 6 }}>
                        <Pressable
                          onPress={() => openEditModal(shift)}
                          style={{
                            paddingVertical: 8,
                            paddingHorizontal: 12,
                            borderRadius: 8,
                            backgroundColor: "#2563eb",
                            flex: 1,
                          }}
                        >
                          <Text style={{ color: "white", fontWeight: "700", textAlign: "center" }}>
                            Change
                          </Text>
                        </Pressable>
                        <Pressable
                          onPress={() => handleDeleteShift(shift.scheduled_shift_id)}
                          style={{
                            paddingVertical: 8,
                            paddingHorizontal: 12,
                            borderRadius: 8,
                            backgroundColor: "#ef4444",
                            flex: 1,
                          }}
                        >
                          <Text style={{ color: "white", fontWeight: "700", textAlign: "center" }}>
                            Delete
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          )}
        </>
      ) : (
        <Text style={{ color: "crimson" }}>Schedule not found</Text>
      )}

      {/* Edit Shift Modal */}
      <Modal
        visible={editModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <View style={{ backgroundColor: "white", borderRadius: 12, padding: 20, gap: 12 }}>
            <Text style={{ fontSize: 20, fontWeight: "700", marginBottom: 8 }}>Edit Shift</Text>

            {editingShift && (
              <>
                <Text style={{ opacity: 0.7 }}>
                  {editingShift.label} - {formatTime(editingShift.start_time)} to {formatTime(editingShift.end_time)}
                </Text>
                <Text style={{ fontWeight: "700", marginTop: 8 }}>Assign to:</Text>
                <ScrollView style={{ maxHeight: 200 }}>
                  {employees.map((emp) => (
                    <Pressable
                      key={emp.employee_id}
                      onPress={() => setSelectedEmployeeId(emp.employee_id)}
                      style={{
                        padding: 12,
                        borderRadius: 8,
                        backgroundColor: selectedEmployeeId === emp.employee_id ? "#2563eb" : "#f3f4f6",
                        marginBottom: 8,
                      }}
                    >
                      <Text
                        style={{
                          color: selectedEmployeeId === emp.employee_id ? "white" : "#111",
                          fontWeight: selectedEmployeeId === emp.employee_id ? "700" : "400",
                        }}
                      >
                        {emp.name} ({emp.email})
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            )}

            <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
              <Pressable
                onPress={() => {
                  setEditModalVisible(false);
                  setEditingShift(null);
                  setSelectedEmployeeId("");
                }}
                style={{
                  flex: 1,
                  padding: 12,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: "#ddd",
                  alignItems: "center",
                }}
              >
                <Text style={{ fontWeight: "700" }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleEditShift}
                disabled={!selectedEmployeeId}
                style={{
                  flex: 1,
                  padding: 12,
                  borderRadius: 8,
                  backgroundColor: selectedEmployeeId ? "#2563eb" : "#999",
                  alignItems: "center",
                  opacity: selectedEmployeeId ? 1 : 0.6,
                }}
              >
                <Text style={{ color: "white", fontWeight: "700" }}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add Shift Modal */}
      <Modal
        visible={addModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setAddModalVisible(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <View style={{ backgroundColor: "white", borderRadius: 12, padding: 20, gap: 12 }}>
            <Text style={{ fontSize: 20, fontWeight: "700", marginBottom: 8 }}>Add Shift</Text>

            <Text style={{ fontWeight: "700" }}>Date (YYYY-MM-DD)</Text>
            <TextInput
              value={newShift.shift_date}
              onChangeText={(v) => setNewShift({ ...newShift, shift_date: v })}
              placeholder="2026-01-15"
              style={{
                borderWidth: 1,
                borderColor: "#ddd",
                borderRadius: 8,
                padding: 12,
              }}
            />

            <Text style={{ fontWeight: "700" }}>Label</Text>
            <TextInput
              value={newShift.label}
              onChangeText={(v) => setNewShift({ ...newShift, label: v })}
              placeholder="Morning Shift"
              style={{
                borderWidth: 1,
                borderColor: "#ddd",
                borderRadius: 8,
                padding: 12,
              }}
            />

            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: "700" }}>Start (HH:MM)</Text>
                <TextInput
                  value={newShift.start_time}
                  onChangeText={(v) => setNewShift({ ...newShift, start_time: v })}
                  placeholder="09:00"
                  style={{
                    borderWidth: 1,
                    borderColor: "#ddd",
                    borderRadius: 8,
                    padding: 12,
                  }}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: "700" }}>End (HH:MM)</Text>
                <TextInput
                  value={newShift.end_time}
                  onChangeText={(v) => setNewShift({ ...newShift, end_time: v })}
                  placeholder="17:00"
                  style={{
                    borderWidth: 1,
                    borderColor: "#ddd",
                    borderRadius: 8,
                    padding: 12,
                  }}
                />
              </View>
            </View>

            <Text style={{ fontWeight: "700" }}>Assign to:</Text>
            <ScrollView style={{ maxHeight: 150 }}>
              {employees.map((emp) => (
                <Pressable
                  key={emp.employee_id}
                  onPress={() => setNewShift({ ...newShift, employee_id: emp.employee_id })}
                  style={{
                    padding: 12,
                    borderRadius: 8,
                    backgroundColor: newShift.employee_id === emp.employee_id ? "#2563eb" : "#f3f4f6",
                    marginBottom: 8,
                  }}
                >
                  <Text
                    style={{
                      color: newShift.employee_id === emp.employee_id ? "white" : "#111",
                      fontWeight: newShift.employee_id === emp.employee_id ? "700" : "400",
                    }}
                  >
                    {emp.name} ({emp.email})
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
              <Pressable
                onPress={() => {
                  setAddModalVisible(false);
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
                  borderWidth: 1,
                  borderColor: "#ddd",
                  alignItems: "center",
                }}
              >
                <Text style={{ fontWeight: "700" }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleAddShift}
                style={{
                  flex: 1,
                  padding: 12,
                  borderRadius: 8,
                  backgroundColor: "#2563eb",
                  alignItems: "center",
                }}
              >
                <Text style={{ color: "white", fontWeight: "700" }}>Add</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}


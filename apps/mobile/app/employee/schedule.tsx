import React, { useEffect, useState, useMemo } from "react";
import { View, Text, ScrollView, Pressable, Alert, Platform } from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiGet } from "../../lib/api";

type Shift = {
  scheduled_shift_id: string;
  shift_date: string;
  label: string;
  start_time: string;
  end_time: string;
};

type MyScheduleResponse = {
  employee_id: string;
  employee_name: string;
  month_start: string;
  month_end: string;
  shifts: Shift[];
};

const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function formatTime(t?: string) {
  return t ? t.slice(0, 5) : "";
}

function parseISODate(s: string): Date {
  return new Date(s + "T00:00:00");
}

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

function firstOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function lastOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

export default function EmployeeSchedule() {
  const [schedule, setSchedule] = useState<MyScheduleResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(() => new Date());
  const [viewMode, setViewMode] = useState<"my-schedule" | "team-schedule">("my-schedule");
  const [teamSchedule, setTeamSchedule] = useState<any>(null);
  const [employeeId, setEmployeeId] = useState<string>("");
  const [companyId, setCompanyId] = useState<string>("");
  const router = useRouter();

  const monthStart = useMemo(() => iso(firstOfMonth(month)), [month]);
  const monthEnd = useMemo(() => iso(lastOfMonth(month)), [month]);

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (viewMode === "my-schedule") {
      loadMySchedule();
    } else {
      loadTeamSchedule();
    }
  }, [monthStart, monthEnd, viewMode]);


  async function checkAuth() {
    const token = await AsyncStorage.getItem("auth_token");
    const storedEmployeeId = await AsyncStorage.getItem("employee_id");
    const storedCompanyId = await AsyncStorage.getItem("company_id");
    
    if (!token) {
      router.replace("/login" as any);
      return;
    }
    
    if (storedEmployeeId) setEmployeeId(storedEmployeeId);
    if (storedCompanyId) setCompanyId(storedCompanyId);
  }

  async function loadMySchedule() {
    setLoading(true);
    try {
      const data = await apiGet<MyScheduleResponse>(
        `/employee/my-schedule?month_start=${monthStart}&month_end=${monthEnd}`
      );
      setSchedule(data);
    } catch (error: any) {
      if (error?.message?.includes("401") || error?.message?.includes("Unauthorized")) {
        await AsyncStorage.removeItem("auth_token");
        router.replace("/login" as any);
      } else {
        Alert.alert("Error", error?.message || "Failed to load schedule");
      }
    } finally {
      setLoading(false);
    }
  }

  async function loadTeamSchedule() {
    setLoading(true);
    try {
      const data = await apiGet<any>(`/employee/team-schedule?month_start=${monthStart}&month_end=${monthEnd}`);
      setTeamSchedule(data);
    } catch (error: any) {
      if (error?.message?.includes("401") || error?.message?.includes("Unauthorized")) {
        await AsyncStorage.removeItem("auth_token");
        router.replace("/login" as any);
      } else {
        Alert.alert("Error", error?.message || "Failed to load team schedule");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    console.log("🔴 Logout button clicked");
    Alert.alert("Logout", "Are you sure you want to logout?", [
      { text: "Cancel", style: "cancel", onPress: () => console.log("❌ Logout cancelled") },
      {
        text: "Logout",
        style: "destructive",
        onPress: async () => {
          console.log("✅ Logout confirmed, starting logout process...");
          
          try {
            console.log("🧹 Clearing AsyncStorage...");
            // Clear all stored data
            await AsyncStorage.multiRemove([
              "auth_token",
              "employee_id",
              "employee_name",
              "company_id",
            ]);
            console.log("✅ AsyncStorage cleared");
            
            // Verify it's cleared
            const token = await AsyncStorage.getItem("auth_token");
            console.log("🔍 Token after clear:", token ? "STILL EXISTS" : "CLEARED");
          } catch (error) {
            console.error("❌ Error clearing storage:", error);
          }
          
          // Reset state
          console.log("🔄 Resetting component state...");
          setSchedule(null);
          setTeamSchedule(null);
          setEmployeeId("");
          setCompanyId("");
          
          // Wait a moment for state to clear
          console.log("⏳ Waiting 100ms before navigation...");
          await new Promise(resolve => setTimeout(resolve, 100));
          
          // Try navigation with multiple methods
          console.log("🧭 Attempting navigation to /login...");
          
          // Method 1: Try replace
          try {
            console.log("📍 Trying router.replace('/login')...");
            router.replace("/login" as any);
            console.log("✅ router.replace called successfully");
            
            // Check if navigation worked after a delay
            setTimeout(() => {
              console.log("🔍 Checking navigation status after 500ms...");
            }, 500);
          } catch (e) {
            console.error("❌ router.replace failed:", e);
            
            // Method 2: Try push
            try {
              console.log("📍 Trying router.push('/login')...");
              router.push("/login" as any);
              console.log("✅ router.push called successfully");
            } catch (e2) {
              console.error("❌ router.push also failed:", e2);
              
              // Method 3: Try with requestAnimationFrame
              console.log("📍 Trying with requestAnimationFrame...");
              requestAnimationFrame(() => {
                try {
                  router.replace("/login" as any);
                  console.log("✅ Navigation with requestAnimationFrame called");
                } catch (e3) {
                  console.error("❌ All navigation methods failed:", e3);
                  Alert.alert("Navigation Error", "Please manually navigate to login page");
                }
              });
            }
          }
        },
      },
    ]);
  }

  function handleOpenForm() {
    if (!employeeId || !companyId) {
      Alert.alert("Error", "Unable to open form. Please try logging in again.");
      return;
    }
    const formPath = `/form/${employeeId}?companyId=${encodeURIComponent(companyId)}`;
    router.push(formPath as any);
  }

  function prevMonth() {
    setMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1));
  }

  function nextMonth() {
    setMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1));
  }

  function goToday() {
    setMonth(new Date());
  }

  // Group shifts by date
  const shiftsByDate = useMemo(() => {
    if (!schedule) return new Map();
    const map = new Map<string, Shift[]>();
    for (const shift of schedule.shifts) {
      const dateKey = shift.shift_date;
      const arr = map.get(dateKey) ?? [];
      arr.push(shift);
      map.set(dateKey, arr);
    }
    return map;
  }, [schedule]);

  // Month grid cells
  const monthCells = useMemo(() => {
    const start = parseISODate(monthStart);
    const end = parseISODate(monthEnd);
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

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "#0b0f14" }}
      contentContainerStyle={{
        padding: 18,
        width: "100%",
        ...(Platform.OS === "web" ? { maxWidth: 600, alignSelf: "center" as const } : {}),
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <Text style={{ fontSize: 34, fontWeight: "800", color: "#e9eaec" }}>My Schedule</Text>
        <Pressable
          onPress={handleLogout}
          style={{
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 8,
            backgroundColor: "#444",
          }}
        >
          <Text style={{ color: "#e9eaec", fontWeight: "700", fontSize: 12 }}>Logout</Text>
        </Pressable>
      </View>

      {schedule && (
        <Text style={{ color: "#9aa4b2", fontSize: 14, marginBottom: 12 }}>
          {schedule.employee_name}
        </Text>
      )}

      {/* View Mode Toggle */}
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
        <Pressable
          onPress={() => setViewMode("my-schedule")}
          style={{
            flex: 1,
            padding: 12,
            borderRadius: 8,
            backgroundColor: viewMode === "my-schedule" ? "#1f6feb" : "#2a2a2a",
            borderWidth: 1,
            borderColor: viewMode === "my-schedule" ? "#1f6feb" : "#444",
          }}
        >
          <Text
            style={{
              color: "#e9eaec",
              fontWeight: viewMode === "my-schedule" ? "700" : "400",
              textAlign: "center",
            }}
          >
            My Schedule
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setViewMode("team-schedule")}
          style={{
            flex: 1,
            padding: 12,
            borderRadius: 8,
            backgroundColor: viewMode === "team-schedule" ? "#1f6feb" : "#2a2a2a",
            borderWidth: 1,
            borderColor: viewMode === "team-schedule" ? "#1f6feb" : "#444",
          }}
        >
          <Text
            style={{
              color: "#e9eaec",
              fontWeight: viewMode === "team-schedule" ? "700" : "400",
              textAlign: "center",
            }}
          >
            Team Schedule
          </Text>
        </Pressable>
      </View>

      {/* Navigation */}
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
        <Pressable
          onPress={prevMonth}
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
          onPress={goToday}
          style={{
            flex: 1,
            paddingVertical: 8,
            borderRadius: 8,
            backgroundColor: "#2a2a2a",
            borderWidth: 1,
            borderColor: "#444",
          }}
        >
          <Text style={{ color: "#e9eaec", fontWeight: "700", textAlign: "center" }}>Today</Text>
        </Pressable>
        <Pressable
          onPress={nextMonth}
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
      </View>

      <Text style={{ color: "#e9eaec", fontSize: 16, fontWeight: "700", marginBottom: 12 }}>
        {month.toLocaleString(undefined, { month: "long", year: "numeric" })}
      </Text>

      {loading ? (
        <Text style={{ color: "#9aa4b2", textAlign: "center", marginTop: 20 }}>Loading...</Text>
      ) : viewMode === "my-schedule" ? (
        <>
          {/* Month Grid */}
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

              const dateObj = parseISODate(d);
              const dayNum = dateObj.getDate();
              const shifts = shiftsByDate.get(d) ?? [];
              const isToday = d === iso(new Date());

              return (
                <Pressable
                  key={idx}
                  style={{
                    width: "14.28%",
                    aspectRatio: 1,
                    padding: 4,
                    borderWidth: 1,
                    borderColor: isToday ? "#1f6feb" : "#333",
                    backgroundColor: isToday ? "rgba(31,111,235,0.1)" : "#1a1a1a",
                  }}
                >
                  <Text
                    style={{
                      color: isToday ? "#1f6feb" : "#e9eaec",
                      fontWeight: isToday ? "700" : "400",
                      fontSize: 12,
                      marginBottom: 4,
                    }}
                  >
                    {dayNum}
                  </Text>
                  {shifts.length > 0 && (
                    <View>
                      {shifts.slice(0, 2).map((s, i) => (
                        <Text key={i} style={{ color: "#7ee787", fontSize: 8 }} numberOfLines={1}>
                          {formatTime(s.start_time)}
                        </Text>
                      ))}
                      {shifts.length > 2 && (
                        <Text style={{ color: "#9aa4b2", fontSize: 8 }}>+{shifts.length - 2}</Text>
                      )}
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>

          {/* Detailed List */}
          <View style={{ marginTop: 20 }}>
            <Text style={{ color: "#e9eaec", fontWeight: "700", fontSize: 18, marginBottom: 12 }}>
              My Shifts
            </Text>
            {schedule?.shifts.length === 0 ? (
              <Text style={{ color: "#9aa4b2", opacity: 0.7 }}>No shifts scheduled this month</Text>
            ) : (
              schedule?.shifts.map((shift) => {
                const dateObj = parseISODate(shift.shift_date);
                const dow = weekdays[(dateObj.getDay() + 6) % 7];
                return (
                  <View
                    key={shift.scheduled_shift_id}
                    style={{
                      padding: 12,
                      backgroundColor: "#1a1a1a",
                      borderRadius: 12,
                      marginBottom: 8,
                      borderWidth: 1,
                      borderColor: "#333",
                    }}
                  >
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <View>
                        <Text style={{ color: "#e9eaec", fontWeight: "700", fontSize: 16 }}>
                          {shift.shift_date} ({dow})
                        </Text>
                        <Text style={{ color: "#9aa4b2", fontSize: 14, marginTop: 4 }}>
                          {formatTime(shift.start_time)} – {formatTime(shift.end_time)}
                        </Text>
                        {shift.label && (
                          <Text style={{ color: "#7ee787", fontSize: 12, marginTop: 4 }}>{shift.label}</Text>
                        )}
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        </>
      ) : (
        <View>
          <Text style={{ color: "#e9eaec", fontWeight: "700", fontSize: 18, marginBottom: 12 }}>
            Team Schedule
          </Text>
          {teamSchedule?.all_shifts?.length === 0 ? (
            <Text style={{ color: "#9aa4b2", opacity: 0.7 }}>No team schedule found for this month</Text>
          ) : (
            Object.entries(teamSchedule?.shifts_by_date || {}).map(([date, shifts]: [string, any]) => {
              const dateObj = parseISODate(date);
              const dow = weekdays[(dateObj.getDay() + 6) % 7];
              return (
                <View
                  key={date}
                  style={{
                    padding: 12,
                    backgroundColor: "#1a1a1a",
                    borderRadius: 12,
                    marginBottom: 12,
                    borderWidth: 1,
                    borderColor: "#333",
                  }}
                >
                  <Text style={{ color: "#e9eaec", fontWeight: "700", fontSize: 16, marginBottom: 8 }}>
                    {date} ({dow})
                  </Text>
                  {shifts.map((shift: any) => (
                    <View
                      key={shift.scheduled_shift_id}
                      style={{
                        padding: 8,
                        backgroundColor: "#2a2a2a",
                        borderRadius: 8,
                        marginBottom: 6,
                      }}
                    >
                      <Text style={{ color: "#e9eaec", fontWeight: "700" }}>{shift.employee_name}</Text>
                      <Text style={{ color: "#9aa4b2", fontSize: 12 }}>
                        {formatTime(shift.start_time)} – {formatTime(shift.end_time)}
                      </Text>
                      {shift.label && <Text style={{ color: "#7ee787", fontSize: 11 }}>{shift.label}</Text>}
                    </View>
                  ))}
                </View>
              );
            })
          )}
        </View>
      )}
    </ScrollView>
  );
}


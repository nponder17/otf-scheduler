import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000";

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

async function apiGet<T>(path: string): Promise<T> {
  const token = localStorage.getItem("auth_token");
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) {
    if (res.status === 401) {
      localStorage.removeItem("auth_token");
      throw new Error("Unauthorized");
    }
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json();
}

export default function EmployeeSchedule() {
  const [schedule, setSchedule] = useState<MyScheduleResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(() => new Date());
  const [viewMode, setViewMode] = useState<"my-schedule" | "team-schedule">("my-schedule");
  const [teamSchedule, setTeamSchedule] = useState<any>(null);
  const navigate = useNavigate();

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
    const token = localStorage.getItem("auth_token");
    if (!token) {
      navigate("/login");
      return;
    }
  }

  async function loadMySchedule() {
    setLoading(true);
    try {
      const data = await apiGet<MyScheduleResponse>(
        `/employee/my-schedule?month_start=${monthStart}&month_end=${monthEnd}`
      );
      setSchedule(data);
    } catch (error: any) {
      if (error?.message?.includes("Unauthorized")) {
        navigate("/login");
      } else {
        alert(error?.message || "Failed to load schedule");
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
      if (error?.message?.includes("Unauthorized")) {
        navigate("/login");
      } else {
        alert(error?.message || "Failed to load team schedule");
      }
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    if (confirm("Are you sure you want to logout?")) {
      localStorage.removeItem("auth_token");
      localStorage.removeItem("employee_id");
      localStorage.removeItem("employee_name");
      localStorage.removeItem("company_id");
      navigate("/login");
    }
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

  const styles: Record<string, React.CSSProperties> = {
    page: {
      minHeight: "100vh",
      width: "100%",
      maxWidth: "100%",
      background: "#0b0f14",
      color: "#e9eaec",
      padding: 20,
    },
    container: {
      maxWidth: "1400px",
      margin: "0 auto",
      width: "100%",
    },
    header: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 20,
    },
    title: {
      fontSize: 34,
      fontWeight: "800",
      color: "#e9eaec",
    },
    button: {
      padding: "10px 16px",
      borderRadius: 8,
      backgroundColor: "#444",
      color: "#e9eaec",
      fontWeight: "700",
      border: "none",
      cursor: "pointer",
    },
    toggleRow: {
      display: "flex",
      gap: 8,
      marginBottom: 12,
    },
    toggleButton: {
      flex: 1,
      padding: 12,
      borderRadius: 8,
      border: "1px solid #444",
      backgroundColor: "#2a2a2a",
      color: "#e9eaec",
      fontWeight: "400",
      cursor: "pointer",
    },
    toggleActive: {
      backgroundColor: "#1f6feb",
      borderColor: "#1f6feb",
      fontWeight: "700",
    },
    navRow: {
      display: "flex",
      gap: 8,
      marginBottom: 12,
    },
    navButton: {
      padding: "10px 16px",
      borderRadius: 8,
      backgroundColor: "#2a2a2a",
      border: "1px solid #444",
      color: "#e9eaec",
      fontWeight: "700",
      cursor: "pointer",
    },
    grid: {
      display: "grid",
      gridTemplateColumns: "repeat(7, 1fr)",
      gap: 4,
      marginBottom: 20,
    },
    dayCell: {
      aspectRatio: "1",
      padding: 8,
      border: "1px solid #333",
      backgroundColor: "#1a1a1a",
      borderRadius: 8,
      minHeight: 80,
    },
    dayCellToday: {
      borderColor: "#1f6feb",
      backgroundColor: "rgba(31,111,235,0.1)",
    },
    shiftCard: {
      padding: 12,
      backgroundColor: "#1a1a1a",
      borderRadius: 12,
      marginBottom: 8,
      border: "1px solid #333",
    },
  };

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.header}>
          <div>
            <div style={styles.title}>My Schedule</div>
            {schedule && <div style={{ color: "#9aa4b2", marginTop: 4 }}>{schedule.employee_name}</div>}
          </div>
          <button onClick={handleLogout} style={styles.button}>
            Logout
          </button>
        </div>

        {/* View Mode Toggle */}
        <div style={styles.toggleRow}>
          <button
            onClick={() => setViewMode("my-schedule")}
            style={{
              ...styles.toggleButton,
              ...(viewMode === "my-schedule" ? styles.toggleActive : {}),
            }}
          >
            My Schedule
          </button>
          <button
            onClick={() => setViewMode("team-schedule")}
            style={{
              ...styles.toggleButton,
              ...(viewMode === "team-schedule" ? styles.toggleActive : {}),
            }}
          >
            Team Schedule
          </button>
        </div>

        {/* Navigation */}
        <div style={styles.navRow}>
          <button onClick={prevMonth} style={styles.navButton}>
            ← Prev
          </button>
          <button onClick={goToday} style={{ ...styles.navButton, flex: 1 }}>
            Today
          </button>
          <button onClick={nextMonth} style={styles.navButton}>
            Next →
          </button>
        </div>

        <div style={{ fontSize: 18, fontWeight: "700", marginBottom: 12 }}>
          {month.toLocaleString(undefined, { month: "long", year: "numeric" })}
        </div>

        {loading ? (
          <div style={{ textAlign: "center", color: "#9aa4b2", marginTop: 20 }}>Loading...</div>
        ) : viewMode === "my-schedule" ? (
          <>
            {/* Month Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 20 }}>
              {weekdays.map((day) => (
                <div key={day} style={{ textAlign: "center", color: "#9aa4b2", fontWeight: "700", fontSize: 12 }}>
                  {day}
                </div>
              ))}
              {monthCells.map((d, idx) => {
                if (!d) {
                  return <div key={idx} style={{ aspectRatio: "1" }} />;
                }

                const dateObj = parseISODate(d);
                const dayNum = dateObj.getDate();
                const shifts = shiftsByDate.get(d) ?? [];
                const isToday = d === iso(new Date());

                return (
                  <div
                    key={idx}
                    style={{
                      ...styles.dayCell,
                      ...(isToday ? styles.dayCellToday : {}),
                    }}
                  >
                    <div
                      style={{
                        color: isToday ? "#1f6feb" : "#e9eaec",
                        fontWeight: isToday ? "700" : "400",
                        fontSize: 14,
                        marginBottom: 4,
                      }}
                    >
                      {dayNum}
                    </div>
                    {shifts.length > 0 && (
                      <div>
                        {shifts.slice(0, 2).map((s: Shift, i: number) => (
                          <div key={i} style={{ color: "#7ee787", fontSize: 10 }}>
                            {formatTime(s.start_time)}
                          </div>
                        ))}
                        {shifts.length > 2 && (
                          <div style={{ color: "#9aa4b2", fontSize: 10 }}>+{shifts.length - 2}</div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Detailed List */}
            <div>
              <div style={{ fontSize: 18, fontWeight: "700", marginBottom: 12 }}>My Shifts</div>
              {schedule?.shifts.length === 0 ? (
                <div style={{ color: "#9aa4b2", opacity: 0.7 }}>No shifts scheduled this month</div>
              ) : (
                schedule?.shifts.map((shift) => {
                  const dateObj = parseISODate(shift.shift_date);
                  const dow = weekdays[(dateObj.getDay() + 6) % 7];
                  return (
                    <div key={shift.scheduled_shift_id} style={styles.shiftCard}>
                      <div style={{ fontWeight: "700", fontSize: 16 }}>
                        {shift.shift_date} ({dow})
                      </div>
                      <div style={{ color: "#9aa4b2", fontSize: 14, marginTop: 4 }}>
                        {formatTime(shift.start_time)} – {formatTime(shift.end_time)}
                      </div>
                      {shift.label && (
                        <div style={{ color: "#7ee787", fontSize: 12, marginTop: 4 }}>{shift.label}</div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </>
        ) : (
          <div>
            <div style={{ fontSize: 18, fontWeight: "700", marginBottom: 12 }}>Team Schedule</div>
            {teamSchedule?.all_shifts?.length === 0 ? (
              <div style={{ color: "#9aa4b2", opacity: 0.7 }}>No team schedule found for this month</div>
            ) : (
              Object.entries(teamSchedule?.shifts_by_date || {}).map(([date, shifts]: [string, any]) => {
                const dateObj = parseISODate(date);
                const dow = weekdays[(dateObj.getDay() + 6) % 7];
                return (
                  <div key={date} style={styles.shiftCard}>
                    <div style={{ fontWeight: "700", fontSize: 16, marginBottom: 8 }}>
                      {date} ({dow})
                    </div>
                    {shifts.map((shift: any) => (
                      <div
                        key={shift.scheduled_shift_id}
                        style={{
                          padding: 8,
                          backgroundColor: "#2a2a2a",
                          borderRadius: 8,
                          marginBottom: 6,
                        }}
                      >
                        <div style={{ fontWeight: "700" }}>{shift.employee_name}</div>
                        <div style={{ color: "#9aa4b2", fontSize: 12 }}>
                          {formatTime(shift.start_time)} – {formatTime(shift.end_time)}
                        </div>
                        {shift.label && <div style={{ color: "#7ee787", fontSize: 11 }}>{shift.label}</div>}
                      </div>
                    ))}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}


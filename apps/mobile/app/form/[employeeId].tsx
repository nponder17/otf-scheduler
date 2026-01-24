import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  Pressable,
  Alert,
  Platform,
  Image,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { apiGet, apiPost, getApiBase } from "../../lib/api";

// Native-only time picker (won't break web)
const DateTimePicker =
  Platform.OS === "web"
    ? null
    : require("@react-native-community/datetimepicker").default;

const API_BASE = getApiBase(); // web/simulator

type Day = 0 | 1 | 2 | 3 | 4 | 5 | 6;

const DAYS: { label: string; value: Day }[] = [
  { label: "Sun", value: 0 },
  { label: "Mon", value: 1 },
  { label: "Tue", value: 2 },
  { label: "Wed", value: 3 },
  { label: "Thu", value: 4 },
  { label: "Fri", value: 5 },
  { label: "Sat", value: 6 },
];

type AvailabilityType = "available" | "preferred";

type AvailabilityBlock = {
  day_of_week: Day;
  start_time: string; // HH:MM
  end_time: string; // HH:MM
  type: AvailabilityType;
};

type UnavailabilityBlock = {
  day_of_week: Day;
  start_time: string;
  end_time: string;
  reason?: string | null;
};

type DateRangeBlock = {
  start_date: string; // YYYY-MM-DD
  end_date: string; // YYYY-MM-DD
  note?: string | null;
};

// ✅ minimal employee meta needed for logo
type EmployeeMeta = { employee_id: string; company_id: string };

function notify(title: string, message: string) {
  if (Platform.OS === "web") {
    // @ts-ignore
    window.alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
}

function pad2(n: number) {
  return n.toString().padStart(2, "0");
}
function dateToHHMM(d: Date) {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function isHHMM(s: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}
function isISODate(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}
function dayLabel(d: Day) {
  return DAYS.find((x) => x.value === d)?.label ?? String(d);
}

function groupByDay<T extends { day_of_week: Day }>(items: T[]) {
  const map = new Map<Day, T[]>();
  for (const it of items) {
    const arr = map.get(it.day_of_week) ?? [];
    arr.push(it);
    map.set(it.day_of_week, arr);
  }
  return DAYS.map((d) => ({ day: d.value, items: map.get(d.value) ?? [] })).filter(
    (x) => x.items.length > 0
  );
}

// ---------- conflict helpers ----------
function toMinutes(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  const as = toMinutes(aStart),
    ae = toMinutes(aEnd);
  const bs = toMinutes(bStart),
    be = toMinutes(bEnd);
  return as < be && bs < ae;
}
function findConflicts(av: AvailabilityBlock[], un: UnavailabilityBlock[]) {
  const conflicts: { day: Day; av: AvailabilityBlock; un: UnavailabilityBlock }[] =
    [];
  for (const a of av) {
    for (const u of un) {
      if (
        a.day_of_week === u.day_of_week &&
        overlaps(a.start_time, a.end_time, u.start_time, u.end_time)
      ) {
        conflicts.push({ day: a.day_of_week, av: a, un: u });
      }
    }
  }
  return conflicts;
}
function conflictMessage(c: {
  day: Day;
  av: AvailabilityBlock;
  un: UnavailabilityBlock;
}) {
  return `You marked ${dayLabel(c.day)} ${c.av.start_time}-${c.av.end_time} as available, but also cannot work ${c.un.start_time}-${c.un.end_time}. Please fix this.`;
}
// -------------------------------------

// ---------- UI helpers ----------
function Spacer({ h = 10 }: { h?: number }) {
  return <View style={{ height: h }} />;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: "#2a2a2a",
        borderRadius: 16,
        padding: 14,
        marginBottom: 14,
      }}
    >
      <Text style={{ fontSize: 18, fontWeight: "700", color: "white" }}>
        {title}
      </Text>
      <Spacer h={10} />
      {children}
    </View>
  );
}

function Button({
  label,
  onPress,
  tone = "primary",
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  tone?: "primary" | "secondary" | "danger" | "success";
  disabled?: boolean;
}) {
  const bg =
    tone === "primary"
      ? "#1f6feb"
      : tone === "success"
      ? "#2ea043"
      : tone === "danger"
      ? "#da3633"
      : "#2d333b";

  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={{
        backgroundColor: disabled ? "#2d333b" : bg,
        padding: 12,
        borderRadius: 12,
        alignItems: "center",
        opacity: disabled ? 0.7 : 1,
        marginTop: 10,
      }}
    >
      <Text style={{ color: "white", fontWeight: "700" }}>{label}</Text>
    </Pressable>
  );
}

function Input(props: any) {
  return (
    <TextInput
      {...props}
      placeholderTextColor="#888"
      style={{
        borderWidth: 1,
        borderColor: "#333",
        borderRadius: 12,
        padding: 10,
        color: "white",
        marginTop: 8,
      }}
    />
  );
}

function ChipGroup<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { label: string; value: T }[];
  onChange: (v: T) => void;
}) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={{
              paddingVertical: 8,
              paddingHorizontal: 12,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: selected ? "#1f6feb" : "#444",
              backgroundColor: selected ? "rgba(31,111,235,0.15)" : "transparent",
              marginRight: 8,
              marginTop: 8,
            }}
          >
            <Text style={{ color: "white", fontWeight: selected ? "700" : "400" }}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function DayChips({ day, setDay }: { day: Day; setDay: (d: Day) => void }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
      {DAYS.map((d) => (
        <Pressable
          key={d.value}
          onPress={() => setDay(d.value)}
          style={{
            paddingVertical: 8,
            paddingHorizontal: 12,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: day === d.value ? "#1f6feb" : "#444",
            backgroundColor: day === d.value ? "rgba(31,111,235,0.15)" : "transparent",
            marginRight: 8,
            marginTop: 8,
          }}
        >
          <Text style={{ color: "white", fontWeight: day === d.value ? "700" : "400" }}>
            {d.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
// -------------------------------------

type Step = "form" | "review";

export default function EmployeeFormScreen() {
  const { employeeId, companyId } = useLocalSearchParams<{ employeeId: string; companyId?: string }>();
  const employeeIdStr = useMemo(() => String(employeeId || ""), [employeeId]);
  const companyIdStr = useMemo(() => String(companyId || ""), [companyId]);

  const [logoFailed, setLogoFailed] = useState(false);
  const [logoBust, setLogoBust] = useState<number>(Date.now());

  useEffect(() => {
    setLogoFailed(false);
    setLogoBust(Date.now());
  }, [employeeIdStr]);

  // ✅ Load employee -> company_id so we can use the company logo endpoint
  useEffect(() => {
    if (!employeeIdStr || employeeIdStr === "undefined") return;

    let cancelled = false;

    (async () => {
      try {
        // IMPORTANT:
        // This assumes your API has GET /employees/{employee_id} that returns company_id
        // If your API uses a different endpoint, change this line.
        const meta = await apiGet<EmployeeMeta>(`/employees/${employeeIdStr}`);
        if (!cancelled) setCompanyId(meta.company_id);
      } catch (e) {
        console.log("Could not load employee meta for logo:", e);
        if (!cancelled) setCompanyId("");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [employeeIdStr]);

  const logoUri = useMemo(() => {
    if (!companyIdStr || companyIdStr === "undefined") return "";
    return `${API_BASE}/admin/companies/${companyIdStr}/logo?bust=${logoBust}`;
  }, [companyIdStr, logoBust]);
  

  const [step, setStep] = useState<Step>("form");

  const [availability, setAvailability] = useState<AvailabilityBlock[]>([]);
  const [unavailability, setUnavailability] = useState<UnavailabilityBlock[]>([]);
  const [timeOff, setTimeOff] = useState<DateRangeBlock[]>([]);
  const [pto, setPto] = useState<DateRangeBlock[]>([]);

  const availabilityRef = useRef<AvailabilityBlock[]>([]);
  const unavailabilityRef = useRef<UnavailabilityBlock[]>([]);
  availabilityRef.current = availability;
  unavailabilityRef.current = unavailability;

  const timeOffRef = useRef<DateRangeBlock[]>([]);
  const ptoRef = useRef<DateRangeBlock[]>([]);
  timeOffRef.current = timeOff;
  ptoRef.current = pto;

  const [day, setDay] = useState<Day>(1);
  const [availType, setAvailType] = useState<AvailabilityType>("available");
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("17:00");

  const [unStart, setUnStart] = useState("09:00");
  const [unEnd, setUnEnd] = useState("17:00");
  const [unReason, setUnReason] = useState("");

  const [toStart, setToStart] = useState("");
  const [toEnd, setToEnd] = useState("");
  const [toNote, setToNote] = useState("");

  const [ptoStart, setPtoStart] = useState("");
  const [ptoEnd, setPtoEnd] = useState("");
  const [ptoNote, setPtoNote] = useState("");

  const [employmentType, setEmploymentType] = useState<"full_time" | "part_time">(
    "part_time"
  );
  const [weekendPreference, setWeekendPreference] = useState<
    "saturday" | "sunday" | "either"
  >("either");
  const [idealHours, setIdealHours] = useState("");
  const [hardNoText, setHardNoText] = useState("");
  const [changesNext30, setChangesNext30] = useState(false);
  const [changesNote, setChangesNote] = useState("");

  const [statusMsg, setStatusMsg] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  const [picker, setPicker] = useState<{
    open: boolean;
    target: "avail_start" | "avail_end" | "un_start" | "un_end";
    temp: Date;
  }>({ open: false, target: "avail_start", temp: new Date() });

  function openPicker(target: typeof picker.target) {
    setPicker({ open: true, target, temp: new Date() });
  }

  function onPicked(_: any, selected?: Date) {
    const d = selected ?? picker.temp;
    const t = dateToHHMM(d);

    if (picker.target === "avail_start") setStart(t);
    if (picker.target === "avail_end") setEnd(t);
    if (picker.target === "un_start") setUnStart(t);
    if (picker.target === "un_end") setUnEnd(t);

    setPicker((p) => ({ ...p, open: false }));
  }

  function addAvailability() {
    if (!isHHMM(start) || !isHHMM(end)) {
      notify("Time format", "Use HH:MM (e.g. 09:00)");
      return;
    }

    const newBlock: AvailabilityBlock = {
      day_of_week: day,
      start_time: start,
      end_time: end,
      type: availType,
    };

    setAvailability((prev) => {
      const next = [...prev, newBlock];
      availabilityRef.current = next;
      return next;
    });

    const conflicts = findConflicts(
      [...availabilityRef.current, newBlock],
      unavailabilityRef.current
    );
    if (conflicts.length) {
      notify("Conflicting entries", conflictMessage(conflicts[0]));
    }
  }

  function addUnavailability() {
    if (!isHHMM(unStart) || !isHHMM(unEnd)) {
      notify("Time format", "Use HH:MM (e.g. 09:00)");
      return;
    }

    const newBlock: UnavailabilityBlock = {
      day_of_week: day,
      start_time: unStart,
      end_time: unEnd,
      reason: unReason || null,
    };

    setUnavailability((prev) => {
      const next = [...prev, newBlock];
      unavailabilityRef.current = next;
      return next;
    });

    const conflicts = findConflicts(availabilityRef.current, [
      ...unavailabilityRef.current,
      newBlock,
    ]);
    if (conflicts.length) {
      notify("Conflicting entries", conflictMessage(conflicts[0]));
    }
  }

  function addTimeOff() {
    if (!isISODate(toStart) || !isISODate(toEnd)) {
      notify("Date format", "Use YYYY-MM-DD for start and end dates.");
      return;
    }
    if (toEnd < toStart) {
      notify("Date range", "End date must be on or after start date.");
      return;
    }

    const newBlock: DateRangeBlock = {
      start_date: toStart,
      end_date: toEnd,
      note: toNote ? toNote : null,
    };

    setTimeOff((prev) => {
      const next = [...prev, newBlock];
      timeOffRef.current = next;
      return next;
    });
    setToStart("");
    setToEnd("");
    setToNote("");
  }

  function addPto() {
    if (!isISODate(ptoStart) || !isISODate(ptoEnd)) {
      notify("Date format", "Use YYYY-MM-DD for start and end dates.");
      return;
    }
    if (ptoEnd < ptoStart) {
      notify("Date range", "End date must be on or after start date.");
      return;
    }

    const newBlock: DateRangeBlock = {
      start_date: ptoStart,
      end_date: ptoEnd,
      note: ptoNote ? ptoNote : null,
    };

    setPto((prev) => {
      const next = [...prev, newBlock];
      ptoRef.current = next;
      return next;
    });
    setPtoStart("");
    setPtoEnd("");
    setPtoNote("");
  }

  function removeAvail(idx: number) {
    setAvailability((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      availabilityRef.current = next;
      return next;
    });
  }
  function removeUnavail(idx: number) {
    setUnavailability((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      unavailabilityRef.current = next;
      return next;
    });
  }
  function removeTimeOff(idx: number) {
    setTimeOff((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      timeOffRef.current = next;
      return next;
    });
  }
  function removePto(idx: number) {
    setPto((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      ptoRef.current = next;
      return next;
    });
  }

  function goToReview() {
    const av = availabilityRef.current;
    const un = unavailabilityRef.current;

    if (av.length === 0) {
      notify("Missing availability", "Please add at least one availability block.");
      return;
    }
    if (idealHours && Number.isNaN(Number(idealHours))) {
      notify("Ideal hours", "Please enter a valid number for ideal weekly hours.");
      return;
    }

    const conflicts = findConflicts(av, un);
    if (conflicts.length) {
      notify("Conflicting entries", conflictMessage(conflicts[0]));
      return;
    }

    setStep("review");
    setStatusMsg("");
  }

  async function submit() {
    if (!employeeIdStr || employeeIdStr === "undefined") {
      notify("Invalid link", "Missing employee ID");
      return;
    }

    setSubmitting(true);
    setStatusMsg("Submitting...");

    try {
      const av = availabilityRef.current;
      const un = unavailabilityRef.current;

      const conflicts = findConflicts(av, un);
      if (conflicts.length) {
        notify("Conflicting entries", conflictMessage(conflicts[0]));
        setSubmitting(false);
        return;
      }

      const rules = [
        { rule_type: "EMPLOYMENT_TYPE", value_json: { type: employmentType } },
        { rule_type: "WEEKEND_PREFERENCE", value_json: { preference: weekendPreference } },
        {
          rule_type: "IDEAL_HOURS_WEEKLY",
          value_json: { hours: idealHours ? Number(idealHours) : null },
        },
        { rule_type: "HARD_NO_CONSTRAINTS", value_json: { note: hardNoText || "" } },
        {
          rule_type: "CHANGES_NEXT_30_DAYS",
          value_json: {
            changes: changesNext30,
            note: changesNext30 ? changesNote || "" : "",
          },
        },
      ];

      await apiPost(`/employees/${employeeIdStr}/submit`, {
        availability: av,
        unavailability: un,
        timeoff: timeOffRef.current,
        pto: ptoRef.current,
        rules,
        source: Platform.OS === "web" ? "web" : "mobile",
        note: "employee form submit",
      });

      setStatusMsg("✅ Submitted successfully.");
      notify("Submitted", "Saved. You can close this page.");
    } catch (e: any) {
      const msg = e?.message || "Unknown error";
      setStatusMsg(`❌ Submit failed: ${msg}`);
      notify("Submit failed", msg);
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  }

  const availByDay = useMemo(() => groupByDay(availability), [availability]);
  const unavailByDay = useMemo(() => groupByDay(unavailability), [unavailability]);

  return (
    <ScrollView
      contentContainerStyle={{
        padding: 16,
        backgroundColor: "#0b0f14",
        flexGrow: 1,
      }}
    >
      {!logoFailed && !!logoUri ? (
        <View style={{ alignItems: "center", marginTop: 4, marginBottom: 10 }}>
          <Image
            source={{ uri: logoUri }}
            style={{ width: 300, height: 200 }}
            resizeMode="contain"
            onError={() => setLogoFailed(true)}
          />
        </View>
      ) : null}

      <Text style={{ fontSize: 26, fontWeight: "800", color: "white" }}>
        Availability Form
      </Text>
      <Text style={{ color: "#9aa4b2", marginTop: 6, marginBottom: 12 }}>
        Employee ID: {employeeIdStr}
      </Text>

      {step === "form" ? (
        <>
          <Card title="Availability">
            <Text style={{ color: "#9aa4b2" }}>
              Select a day and add the time ranges you can work.
            </Text>

            <Spacer h={8} />
            <DayChips day={day} setDay={setDay} />

            <Spacer h={10} />
            <Text style={{ color: "white", fontWeight: "700" }}>
              Availability type
            </Text>
            <ChipGroup
              value={availType}
              options={[
                { label: "Available", value: "available" },
                { label: "Preferred", value: "preferred" },
              ]}
              onChange={setAvailType}
            />

            <Spacer h={10} />
            <Text style={{ color: "white", fontWeight: "700" }}>Start / End</Text>

            <View style={{ flexDirection: "row", marginTop: 10 }}>
              <View style={{ flex: 1, marginRight: 10 }}>
                {Platform.OS === "web" ? (
                  <Input value={start} onChangeText={setStart} placeholder="09:00" />
                ) : (
                  <Button label={`Start: ${start}`} onPress={() => openPicker("avail_start")} />
                )}
              </View>
              <View style={{ flex: 1 }}>
                {Platform.OS === "web" ? (
                  <Input value={end} onChangeText={setEnd} placeholder="17:00" />
                ) : (
                  <Button label={`End: ${end}`} onPress={() => openPicker("avail_end")} />
                )}
              </View>
            </View>

            <Button label="Add availability block" onPress={addAvailability} />

            {availability.length ? (
              <View style={{ marginTop: 10 }}>
                {availability.map((b, idx) => (
                  <View
                    key={idx}
                    style={{
                      borderWidth: 1,
                      borderColor: "#222",
                      borderRadius: 12,
                      padding: 10,
                      marginTop: 10,
                    }}
                  >
                    <Text style={{ color: "white" }}>
                      {dayLabel(b.day_of_week)} {b.start_time}–{b.end_time} ({b.type})
                    </Text>
                    <Button label="Remove" tone="danger" onPress={() => removeAvail(idx)} />
                  </View>
                ))}
              </View>
            ) : (
              <Text style={{ color: "#9aa4b2", marginTop: 10 }}>
                No availability added yet.
              </Text>
            )}
          </Card>

          <Card title="Cannot Work (Weekly)">
            <Text style={{ color: "#9aa4b2" }}>
              Add any weekly times you absolutely cannot work.
            </Text>

            <Spacer h={10} />
            <Text style={{ color: "white", fontWeight: "700" }}>Start / End</Text>

            <View style={{ flexDirection: "row", marginTop: 10 }}>
              <View style={{ flex: 1, marginRight: 10 }}>
                {Platform.OS === "web" ? (
                  <Input value={unStart} onChangeText={setUnStart} placeholder="09:00" />
                ) : (
                  <Button label={`Start: ${unStart}`} onPress={() => openPicker("un_start")} />
                )}
              </View>
              <View style={{ flex: 1 }}>
                {Platform.OS === "web" ? (
                  <Input value={unEnd} onChangeText={setUnEnd} placeholder="17:00" />
                ) : (
                  <Button label={`End: ${unEnd}`} onPress={() => openPicker("un_end")} />
                )}
              </View>
            </View>

            <Text style={{ color: "white", fontWeight: "700", marginTop: 10 }}>
              Reason (optional)
            </Text>
            <Input value={unReason} onChangeText={setUnReason} placeholder="e.g., class 10–12" />

            <Button label="Add cannot-work block" onPress={addUnavailability} />

            {unavailability.length ? (
              <View style={{ marginTop: 10 }}>
                {unavailability.map((b, idx) => (
                  <View
                    key={idx}
                    style={{
                      borderWidth: 1,
                      borderColor: "#222",
                      borderRadius: 12,
                      padding: 10,
                      marginTop: 10,
                    }}
                  >
                    <Text style={{ color: "white" }}>
                      {dayLabel(b.day_of_week)} {b.start_time}–{b.end_time}
                      {b.reason ? ` (${b.reason})` : ""}
                    </Text>
                    <Button label="Remove" tone="danger" onPress={() => removeUnavail(idx)} />
                  </View>
                ))}
              </View>
            ) : (
              <Text style={{ color: "#9aa4b2", marginTop: 10 }}>
                No cannot-work blocks added yet.
              </Text>
            )}
          </Card>

          <Card title="Time Off (Unpaid) — Date Range">
            <Text style={{ color: "#9aa4b2" }}>
              Enter date ranges you will be unavailable (unpaid time off).
            </Text>

            <Text style={{ color: "white", fontWeight: "700", marginTop: 10 }}>
              Start date (YYYY-MM-DD)
            </Text>
            <Input value={toStart} onChangeText={setToStart} placeholder="2026-01-15" />

            <Text style={{ color: "white", fontWeight: "700", marginTop: 10 }}>
              End date (YYYY-MM-DD)
            </Text>
            <Input value={toEnd} onChangeText={setToEnd} placeholder="2026-01-18" />

            <Text style={{ color: "white", fontWeight: "700", marginTop: 10 }}>
              Note (optional)
            </Text>
            <Input value={toNote} onChangeText={setToNote} placeholder="Trip / appointment" />

            <Button label="Add time off" onPress={addTimeOff} />

            {timeOff.length ? (
              <View style={{ marginTop: 10 }}>
                {timeOff.map((b, idx) => (
                  <View
                    key={idx}
                    style={{
                      borderWidth: 1,
                      borderColor: "#222",
                      borderRadius: 12,
                      padding: 10,
                      marginTop: 10,
                    }}
                  >
                    <Text style={{ color: "white" }}>
                      {b.start_date} → {b.end_date}
                      {b.note ? ` (${b.note})` : ""}
                    </Text>
                    <Button label="Remove" tone="danger" onPress={() => removeTimeOff(idx)} />
                  </View>
                ))}
              </View>
            ) : (
              <Text style={{ color: "#9aa4b2", marginTop: 10 }}>
                No time off added yet.
              </Text>
            )}
          </Card>

          <Card title="PTO (Paid Time Off) — Date Range">
            <Text style={{ color: "#9aa4b2" }}>
              Enter date ranges you are requesting as PTO.
            </Text>

            <Text style={{ color: "white", fontWeight: "700", marginTop: 10 }}>
              Start date (YYYY-MM-DD)
            </Text>
            <Input value={ptoStart} onChangeText={setPtoStart} placeholder="2026-02-01" />

            <Text style={{ color: "white", fontWeight: "700", marginTop: 10 }}>
              End date (YYYY-MM-DD)
            </Text>
            <Input value={ptoEnd} onChangeText={setPtoEnd} placeholder="2026-02-03" />

            <Text style={{ color: "white", fontWeight: "700", marginTop: 10 }}>
              Note (optional)
            </Text>
            <Input value={ptoNote} onChangeText={setPtoNote} placeholder="Vacation" />

            <Button label="Add PTO" onPress={addPto} />

            {pto.length ? (
              <View style={{ marginTop: 10 }}>
                {pto.map((b, idx) => (
                  <View
                    key={idx}
                    style={{
                      borderWidth: 1,
                      borderColor: "#222",
                      borderRadius: 12,
                      padding: 10,
                      marginTop: 10,
                    }}
                  >
                    <Text style={{ color: "white" }}>
                      {b.start_date} → {b.end_date}
                      {b.note ? ` (${b.note})` : ""}
                    </Text>
                    <Button label="Remove" tone="danger" onPress={() => removePto(idx)} />
                  </View>
                ))}
              </View>
            ) : (
              <Text style={{ color: "#9aa4b2", marginTop: 10 }}>
                No PTO added yet.
              </Text>
            )}
          </Card>

          <Card title="Preferences">
            <Text style={{ color: "white", fontWeight: "800" }}>
              You are required to work Saturday or Sunday, which do you prefer?
            </Text>
            <ChipGroup
              value={weekendPreference}
              options={[
                { label: "Saturday", value: "saturday" },
                { label: "Sunday", value: "sunday" },
                { label: "Either", value: "either" },
              ]}
              onChange={setWeekendPreference}
            />

            <Text style={{ color: "white", fontWeight: "700", marginTop: 12 }}>
              Are you full-time or part-time?
            </Text>
            <ChipGroup
              value={employmentType}
              options={[
                { label: "Full-time", value: "full_time" },
                { label: "Part-time", value: "part_time" },
              ]}
              onChange={setEmploymentType}
            />

            <Text style={{ color: "white", fontWeight: "700", marginTop: 12 }}>
              Ideally, how many hours per week?
            </Text>
            <Input
              value={idealHours}
              onChangeText={setIdealHours}
              placeholder="e.g., 20"
              keyboardType={Platform.OS === "ios" ? "number-pad" : "numeric"}
            />

            <Text style={{ color: "white", fontWeight: "700", marginTop: 12 }}>
              Any days/hours you absolutely cannot work? (optional note)
            </Text>
            <Input
              value={hardNoText}
              onChangeText={setHardNoText}
              placeholder="Example: Tue/Thu after 5pm"
            />

            <Text style={{ color: "white", fontWeight: "700", marginTop: 12 }}>
              Will there be any changes to your schedule in the next 30 days?
            </Text>
            <ChipGroup
              value={changesNext30 ? "yes" : "no"}
              options={[
                { label: "No", value: "no" },
                { label: "Yes", value: "yes" },
              ]}
              onChange={(v) => setChangesNext30(v === "yes")}
            />

            {changesNext30 ? (
              <>
                <Text style={{ color: "white", fontWeight: "700", marginTop: 12 }}>
                  Optional details
                </Text>
                <Input
                  value={changesNote}
                  onChangeText={setChangesNote}
                  placeholder="Example: New class schedule starts Jan 15"
                />
              </>
            ) : null}
          </Card>

          <Button label="Review" tone="success" onPress={goToReview} />
        </>
      ) : (
        <>
          <Card title="Review your answers">
            <Text style={{ color: "#9aa4b2" }}>
              If everything looks correct, tap Submit.
            </Text>
            <Text style={{ color: "#7ee787", fontWeight: "700", marginTop: 10 }}>
              ✅ Ready to submit
            </Text>
          </Card>

          <Card title="Availability (by day)">
            {availByDay.length ? (
              <View>
                {availByDay.map(({ day, items }) => (
                  <View key={day} style={{ marginTop: 10 }}>
                    <Text style={{ color: "white", fontWeight: "800" }}>
                      {dayLabel(day)}
                    </Text>
                    {items.map((b: AvailabilityBlock, idx: number) => (
                      <Text key={idx} style={{ color: "#c9d1d9", marginTop: 4 }}>
                        • {b.start_time}–{b.end_time} ({b.type})
                      </Text>
                    ))}
                  </View>
                ))}
              </View>
            ) : (
              <Text style={{ color: "#9aa4b2" }}>No availability added.</Text>
            )}
          </Card>

          <Card title="Cannot Work (by day)">
            {unavailByDay.length ? (
              <View>
                {unavailByDay.map(({ day, items }) => (
                  <View key={day} style={{ marginTop: 10 }}>
                    <Text style={{ color: "white", fontWeight: "800" }}>
                      {dayLabel(day)}
                    </Text>
                    {items.map((b: UnavailabilityBlock, idx: number) => (
                      <Text key={idx} style={{ color: "#c9d1d9", marginTop: 4 }}>
                        • {b.start_time}–{b.end_time}
                        {b.reason ? ` (${b.reason})` : ""}
                      </Text>
                    ))}
                  </View>
                ))}
              </View>
            ) : (
              <Text style={{ color: "#9aa4b2" }}>No cannot-work blocks added.</Text>
            )}
          </Card>

          <Card title="Time Off (Unpaid)">
            {timeOff.length ? (
              <View>
                {timeOff.map((b, idx) => (
                  <Text key={idx} style={{ color: "#c9d1d9", marginTop: 6 }}>
                    • {b.start_date} → {b.end_date}
                    {b.note ? ` (${b.note})` : ""}
                  </Text>
                ))}
              </View>
            ) : (
              <Text style={{ color: "#9aa4b2" }}>No time off added.</Text>
            )}
          </Card>

          <Card title="PTO (Paid Time Off)">
            {pto.length ? (
              <View>
                {pto.map((b, idx) => (
                  <Text key={idx} style={{ color: "#c9d1d9", marginTop: 6 }}>
                    • {b.start_date} → {b.end_date}
                    {b.note ? ` (${b.note})` : ""}
                  </Text>
                ))}
              </View>
            ) : (
              <Text style={{ color: "#9aa4b2" }}>No PTO added.</Text>
            )}
          </Card>

          <View style={{ flexDirection: "row", marginTop: 10 }}>
            <View style={{ flex: 1, marginRight: 10 }}>
              <Button label="Back to edit" tone="secondary" onPress={() => setStep("form")} />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                label={submitting ? "Submitting..." : "Submit"}
                tone="success"
                onPress={submit}
                disabled={submitting}
              />
            </View>
          </View>

          {!!statusMsg && (
            <Text style={{ color: "#9aa4b2", marginTop: 10 }}>{statusMsg}</Text>
          )}
        </>
      )}

      {picker.open && Platform.OS !== "web" && DateTimePicker ? (
        <DateTimePicker value={picker.temp} mode="time" is24Hour={true} onChange={onPicked} />
      ) : null}

      <View style={{ height: 24 }} />
    </ScrollView>
  );
}


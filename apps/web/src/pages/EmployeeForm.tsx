// apps/web/src/pages/EmployeeForm.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000";

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

function notify(title: string, message: string) {
  window.alert(`${title}\n\n${message}`);
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
  const conflicts: { day: Day; av: AvailabilityBlock; un: UnavailabilityBlock }[] = [];
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
function conflictMessage(c: { day: Day; av: AvailabilityBlock; un: UnavailabilityBlock }) {
  return `You marked ${dayLabel(c.day)} ${c.av.start_time}-${c.av.end_time} as available, but also cannot work ${c.un.start_time}-${c.un.end_time}. Please fix this.`;
}
// -------------------------------------

// ---------- UI helpers ----------
function Spacer({ h = 10 }: { h?: number }) {
  return <div style={{ height: h }} />;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        border: "1px solid #2a2a2a",
        borderRadius: 16,
        padding: 14,
        marginBottom: 14,
      }}
    >
      <div style={{ fontSize: 18, fontWeight: "700", color: "white" }}>{title}</div>
      <Spacer h={10} />
      {children}
    </div>
  );
}

function Button({
  label,
  onClick,
  tone = "primary",
  disabled = false,
}: {
  label: string;
  onClick: () => void;
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
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        backgroundColor: disabled ? "#2d333b" : bg,
        padding: 12,
        borderRadius: 12,
        border: "none",
        color: "white",
        fontWeight: "700",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.7 : 1,
        marginTop: 10,
        width: "100%",
      }}
    >
      {label}
    </button>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      style={{
        border: "1px solid #333",
        borderRadius: 12,
        padding: 10,
        color: "white",
        backgroundColor: "#0b0f14",
        marginTop: 8,
        width: "100%",
        ...props.style,
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
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            style={{
              padding: "8px 12px",
              borderRadius: 999,
              border: `1px solid ${selected ? "#1f6feb" : "#444"}`,
              backgroundColor: selected ? "rgba(31,111,235,0.15)" : "transparent",
              color: "white",
              fontWeight: selected ? "700" : "400",
              cursor: "pointer",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function DayChips({ day, setDay }: { day: Day; setDay: (d: Day) => void }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {DAYS.map((d) => (
        <button
          key={d.value}
          onClick={() => setDay(d.value)}
          style={{
            padding: "8px 12px",
            borderRadius: 999,
            border: `1px solid ${day === d.value ? "#1f6feb" : "#444"}`,
            backgroundColor: day === d.value ? "rgba(31,111,235,0.15)" : "transparent",
            color: "white",
            fontWeight: day === d.value ? "700" : "400",
            cursor: "pointer",
          }}
        >
          {d.label}
        </button>
      ))}
    </div>
  );
}
// -------------------------------------

type Step = "form" | "review";

export default function EmployeeForm() {
  const { employeeId } = useParams<{ employeeId: string }>();
  const [searchParams] = useSearchParams();
  const companyId = searchParams.get("companyId");

  const employeeIdStr = useMemo(() => String(employeeId || ""), [employeeId]);
  const companyIdStr = useMemo(() => String(companyId || ""), [companyId]);

  const [logoFailed, setLogoFailed] = useState(false);
  const [logoBust, setLogoBust] = useState<number>(Date.now());

  useEffect(() => {
    setLogoFailed(false);
    setLogoBust(Date.now());
  }, [employeeIdStr, companyIdStr]);

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

  const [unDay, setUnDay] = useState<Day>(1);
  const [unStart, setUnStart] = useState("09:00");
  const [unEnd, setUnEnd] = useState("17:00");
  const [unReason, setUnReason] = useState("");

  const [toStart, setToStart] = useState("");
  const [toEnd, setToEnd] = useState("");
  const [toNote, setToNote] = useState("");

  const [ptoStart, setPtoStart] = useState("");
  const [ptoEnd, setPtoEnd] = useState("");
  const [ptoNote, setPtoNote] = useState("");

  const [employmentType, setEmploymentType] = useState<"full_time" | "part_time">("part_time");
  const [weekendPreference, setWeekendPreference] = useState<"saturday" | "sunday" | "either">(
    "either"
  );
  const [idealHours, setIdealHours] = useState("");
  const [hardNoText, setHardNoText] = useState("");
  const [changesNext30, setChangesNext30] = useState(false);
  const [changesNote, setChangesNote] = useState("");

  const [statusMsg, setStatusMsg] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

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
    if (conflicts.length) notify("Conflicting entries", conflictMessage(conflicts[0]));
  }

  function addUnavailability() {
    if (!isHHMM(unStart) || !isHHMM(unEnd)) {
      notify("Time format", "Use HH:MM (e.g. 09:00)");
      return;
    }

    const newBlock: UnavailabilityBlock = {
      day_of_week: unDay,
      start_time: unStart,
      end_time: unEnd,
      reason: unReason || null,
    };

    setUnavailability((prev) => {
      const next = [...prev, newBlock];
      unavailabilityRef.current = next;
      return next;
    });

    const conflicts = findConflicts(availabilityRef.current, [...unavailabilityRef.current, newBlock]);
    if (conflicts.length) notify("Conflicting entries", conflictMessage(conflicts[0]));
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

    const newBlock: DateRangeBlock = { start_date: toStart, end_date: toEnd, note: toNote || null };
    setTimeOff((prev) => [...prev, newBlock]);

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
      note: ptoNote || null,
    };
    setPto((prev) => [...prev, newBlock]);

    setPtoStart("");
    setPtoEnd("");
    setPtoNote("");
  }

  function removeAvail(idx: number) {
    setAvailability((prev) => prev.filter((_, i) => i !== idx));
  }
  function removeUnavail(idx: number) {
    setUnavailability((prev) => prev.filter((_, i) => i !== idx));
  }
  function removeTimeOff(idx: number) {
    setTimeOff((prev) => prev.filter((_, i) => i !== idx));
  }
  function removePto(idx: number) {
    setPto((prev) => prev.filter((_, i) => i !== idx));
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
        { rule_type: "IDEAL_HOURS_WEEKLY", value_json: { hours: idealHours ? Number(idealHours) : null } },
        { rule_type: "HARD_NO_CONSTRAINTS", value_json: { note: hardNoText || "" } },
        {
          rule_type: "CHANGES_NEXT_30_DAYS",
          value_json: { changes: changesNext30, note: changesNext30 ? changesNote || "" : "" },
        },
      ];

      const res = await fetch(`${API_BASE}/employees/${employeeIdStr}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          availability: av,
          unavailability: un,
          timeoff: timeOffRef.current,
          pto: ptoRef.current,
          rules,
          source: "web",
          note: "employee form submit",
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data?.detail || "Submit failed");
      }

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

  const missingCompanyId = !companyIdStr || companyIdStr === "undefined";

  const styles: Record<string, React.CSSProperties> = {
    page: {
      minHeight: "100vh",
      background: "#0b0f14",
      color: "#e9eaec",
      padding: 16,
    },
    logoContainer: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      marginTop: 4,
      marginBottom: 10,
    },
    logo: {
      maxWidth: 300,
      maxHeight: 200,
      objectFit: "contain",
    },
    warningBox: {
      border: "1px solid #333",
      borderRadius: 12,
      padding: 12,
      marginBottom: 12,
    },
    warningTitle: {
      color: "#fbbf24",
      fontWeight: "800",
    },
    warningText: {
      color: "#9aa4b2",
      marginTop: 6,
    },
    title: {
      fontSize: 26,
      fontWeight: "800",
      color: "white",
    },
    subtitle: {
      color: "#9aa4b2",
      marginTop: 6,
      marginBottom: 12,
    },
    sectionTitle: {
      color: "white",
      fontWeight: "700",
      marginTop: 10,
    },
    row: {
      display: "flex",
      flexDirection: "row",
      gap: 10,
      marginTop: 10,
    },
    col: {
      flex: 1,
    },
    blockItem: {
      border: "1px solid #222",
      borderRadius: 12,
      padding: 10,
      marginTop: 10,
    },
    blockText: {
      color: "white",
    },
    emptyText: {
      color: "#9aa4b2",
      marginTop: 10,
    },
  };

  return (
    <div style={styles.page}>
      {!missingCompanyId ? (
        !logoFailed && !!logoUri ? (
          <div style={styles.logoContainer}>
            <img
              src={logoUri}
              alt="Company logo"
              style={styles.logo}
              onError={() => setLogoFailed(true)}
            />
          </div>
        ) : null
      ) : (
        <div style={styles.warningBox}>
          <div style={styles.warningTitle}>Missing companyId in link</div>
          <div style={styles.warningText}>
            Your manager link must include <span style={{ color: "white" }}>?companyId=...</span>
            <br />
            Ask them to re-copy the form link from the admin dashboard.
          </div>
        </div>
      )}

      <div style={styles.title}>Availability Form</div>
      <div style={styles.subtitle}>Employee ID: {employeeIdStr}</div>

      {step === "form" ? (
        <>
          <Card title="Availability">
            <div style={{ color: "#9aa4b2" }}>
              Select a day and add the time ranges you can work.
            </div>

            <Spacer h={8} />
            <DayChips day={day} setDay={setDay} />

            <Spacer h={10} />
            <div style={styles.sectionTitle}>Availability type</div>
            <ChipGroup
              value={availType}
              options={[
                { label: "Available", value: "available" },
                { label: "Preferred", value: "preferred" },
              ]}
              onChange={setAvailType}
            />

            <Spacer h={10} />
            <div style={styles.sectionTitle}>Start / End</div>

            <div style={styles.row}>
              <div style={styles.col}>
                <Input
                  type="time"
                  value={start}
                  onChange={(e) => setStart(e.target.value.substring(0, 5))}
                  placeholder="09:00"
                />
              </div>
              <div style={styles.col}>
                <Input
                  type="time"
                  value={end}
                  onChange={(e) => setEnd(e.target.value.substring(0, 5))}
                  placeholder="17:00"
                />
              </div>
            </div>

            <Button label="Add availability block" onClick={addAvailability} />

            {availability.length ? (
              <div style={{ marginTop: 10 }}>
                {availability.map((b, idx) => (
                  <div key={idx} style={styles.blockItem}>
                    <div style={styles.blockText}>
                      {dayLabel(b.day_of_week)} {b.start_time}–{b.end_time} ({b.type})
                    </div>
                    <Button label="Remove" tone="danger" onClick={() => removeAvail(idx)} />
                  </div>
                ))}
              </div>
            ) : (
              <div style={styles.emptyText}>No availability added yet.</div>
            )}
          </Card>

          <Card title="Unavailability">
            <div style={{ color: "#9aa4b2" }}>
              Select times when you cannot work.
            </div>

            <Spacer h={8} />
            <DayChips day={unDay} setDay={setUnDay} />

            <Spacer h={10} />
            <div style={styles.sectionTitle}>Start / End</div>

            <div style={styles.row}>
              <div style={styles.col}>
                <Input
                  type="time"
                  value={unStart}
                  onChange={(e) => setUnStart(e.target.value.substring(0, 5))}
                  placeholder="09:00"
                />
              </div>
              <div style={styles.col}>
                <Input
                  type="time"
                  value={unEnd}
                  onChange={(e) => setUnEnd(e.target.value.substring(0, 5))}
                  placeholder="17:00"
                />
              </div>
            </div>

            <Spacer h={10} />
            <div style={styles.sectionTitle}>Reason (optional)</div>
            <Input
              value={unReason}
              onChange={(e) => setUnReason(e.target.value)}
              placeholder="e.g., class, appointment"
            />

            <Button label="Add unavailability block" onClick={addUnavailability} />

            {unavailability.length ? (
              <div style={{ marginTop: 10 }}>
                {unavailability.map((b, idx) => (
                  <div key={idx} style={styles.blockItem}>
                    <div style={styles.blockText}>
                      {dayLabel(b.day_of_week)} {b.start_time}–{b.end_time}
                      {b.reason && ` (${b.reason})`}
                    </div>
                    <Button label="Remove" tone="danger" onClick={() => removeUnavail(idx)} />
                  </div>
                ))}
              </div>
            ) : (
              <div style={styles.emptyText}>No unavailability added yet.</div>
            )}
          </Card>

          <Card title="Time Off">
            <div style={{ color: "#9aa4b2" }}>Add date ranges when you cannot work.</div>

            <Spacer h={10} />
            <div style={styles.sectionTitle}>Start Date</div>
            <Input
              type="date"
              value={toStart}
              onChange={(e) => setToStart(e.target.value)}
            />

            <Spacer h={10} />
            <div style={styles.sectionTitle}>End Date</div>
            <Input
              type="date"
              value={toEnd}
              onChange={(e) => setToEnd(e.target.value)}
            />

            <Spacer h={10} />
            <div style={styles.sectionTitle}>Note (optional)</div>
            <Input
              value={toNote}
              onChange={(e) => setToNote(e.target.value)}
              placeholder="e.g., vacation, family event"
            />

            <Button label="Add time off" onClick={addTimeOff} />

            {timeOff.length ? (
              <div style={{ marginTop: 10 }}>
                {timeOff.map((b, idx) => (
                  <div key={idx} style={styles.blockItem}>
                    <div style={styles.blockText}>
                      {b.start_date} to {b.end_date}
                      {b.note && ` (${b.note})`}
                    </div>
                    <Button label="Remove" tone="danger" onClick={() => removeTimeOff(idx)} />
                  </div>
                ))}
              </div>
            ) : (
              <div style={styles.emptyText}>No time off added yet.</div>
            )}
          </Card>

          <Card title="PTO">
            <div style={{ color: "#9aa4b2" }}>Add planned time off.</div>

            <Spacer h={10} />
            <div style={styles.sectionTitle}>Start Date</div>
            <Input
              type="date"
              value={ptoStart}
              onChange={(e) => setPtoStart(e.target.value)}
            />

            <Spacer h={10} />
            <div style={styles.sectionTitle}>End Date</div>
            <Input
              type="date"
              value={ptoEnd}
              onChange={(e) => setPtoEnd(e.target.value)}
            />

            <Spacer h={10} />
            <div style={styles.sectionTitle}>Note (optional)</div>
            <Input
              value={ptoNote}
              onChange={(e) => setPtoNote(e.target.value)}
              placeholder="e.g., vacation"
            />

            <Button label="Add PTO" onClick={addPto} />

            {pto.length ? (
              <div style={{ marginTop: 10 }}>
                {pto.map((b, idx) => (
                  <div key={idx} style={styles.blockItem}>
                    <div style={styles.blockText}>
                      {b.start_date} to {b.end_date}
                      {b.note && ` (${b.note})`}
                    </div>
                    <Button label="Remove" tone="danger" onClick={() => removePto(idx)} />
                  </div>
                ))}
              </div>
            ) : (
              <div style={styles.emptyText}>No PTO added yet.</div>
            )}
          </Card>

          <Card title="Preferences">
            <div style={styles.sectionTitle}>Employment Type</div>
            <ChipGroup
              value={employmentType}
              options={[
                { label: "Full Time", value: "full_time" },
                { label: "Part Time", value: "part_time" },
              ]}
              onChange={setEmploymentType}
            />

            <Spacer h={10} />
            <div style={styles.sectionTitle}>Weekend Preference</div>
            <ChipGroup
              value={weekendPreference}
              options={[
                { label: "Saturday", value: "saturday" },
                { label: "Sunday", value: "sunday" },
                { label: "Either", value: "either" },
              ]}
              onChange={setWeekendPreference}
            />

            <Spacer h={10} />
            <div style={styles.sectionTitle}>Ideal Weekly Hours (optional)</div>
            <Input
              type="number"
              value={idealHours}
              onChange={(e) => setIdealHours(e.target.value)}
              placeholder="e.g., 20"
            />

            <Spacer h={10} />
            <div style={styles.sectionTitle}>Hard No Constraints (optional)</div>
            <Input
              value={hardNoText}
              onChange={(e) => setHardNoText(e.target.value)}
              placeholder="Any constraints you absolutely cannot work around"
            />

            <Spacer h={10} />
            <div style={styles.sectionTitle}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={changesNext30}
                  onChange={(e) => setChangesNext30(e.target.checked)}
                />
                <span>Expecting changes in next 30 days?</span>
              </label>
            </div>

            {changesNext30 && (
              <>
                <Spacer h={10} />
                <div style={styles.sectionTitle}>Changes Note</div>
                <Input
                  value={changesNote}
                  onChange={(e) => setChangesNote(e.target.value)}
                  placeholder="Describe expected changes"
                />
              </>
            )}
          </Card>

          <Button label="Review" tone="success" onClick={goToReview} />
        </>
      ) : (
        <>
          <Card title="Review your answers">
            <div style={{ color: "#9aa4b2" }}>
              If everything looks correct, click Submit.
            </div>
            <div style={{ color: "#7ee787", fontWeight: "700", marginTop: 10 }}>
              ✅ Ready to submit
            </div>
          </Card>

          <div style={styles.row}>
            <div style={styles.col}>
              <Button label="Back to edit" tone="secondary" onClick={() => setStep("form")} />
            </div>
            <div style={styles.col}>
              <Button
                label={submitting ? "Submitting..." : "Submit"}
                tone="success"
                onClick={submit}
                disabled={submitting}
              />
            </div>
          </div>

          {!!statusMsg && <div style={{ color: "#9aa4b2", marginTop: 10 }}>{statusMsg}</div>}
        </>
      )}

      <div style={{ height: 24 }} />
    </div>
  );
}

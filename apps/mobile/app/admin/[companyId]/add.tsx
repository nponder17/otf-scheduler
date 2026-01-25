import React, { useMemo, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  Platform,
  Alert,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { apiPost } from "../../../lib/api";

type EmployeeCreatePayload = {
  name: string;
  email: string;
  phone?: string | null;
  hire_date?: string | null; // YYYY-MM-DD
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
  if (Platform.OS === "web") {
    // @ts-ignore
    window.alert(`${title}\n\n${msg}`);
  } else {
    Alert.alert(title, msg);
  }
}

function isEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

function isISODate(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s.trim());
}

function InputLabel({ children }: { children: React.ReactNode }) {
  return <Text style={{ fontWeight: "700" }}>{children}</Text>;
}

function ErrorText({ children }: { children: React.ReactNode }) {
  return <Text style={{ color: "crimson", marginTop: 4 }}>{children}</Text>;
}

function Button({
  label,
  onPress,
  variant = "primary",
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary";
  disabled?: boolean;
}) {
  const bg = variant === "primary" ? "#111" : "transparent";
  const borderWidth = variant === "secondary" ? 1 : 0;
  const borderColor = "#ddd";
  const color = variant === "primary" ? "white" : "#111";

  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={{
        flex: 1,
        padding: 12,
        borderRadius: 10,
        backgroundColor: disabled ? "#999" : bg,
        borderWidth,
        borderColor,
        alignItems: "center",
        opacity: disabled ? 0.85 : 1,
      }}
    >
      <Text style={{ color, fontWeight: "700" }}>{label}</Text>
    </Pressable>
  );
}

export default function AddEmployeeScreen() {
  const router = useRouter();
  const { companyId } = useLocalSearchParams<{ companyId: string }>();
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

  function validate(vals?: {
    name?: string;
    email?: string;
    hireDate?: string;
  }) {
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

    // If backend gave you "http://localhost:8081/form/<id>" convert to "/form/<id>"
    // If it already is "/form/<id>", keep it.
    try {
      if (formUrl.startsWith("/")) return formUrl;
      // works for absolute URL
      const u = new URL(formUrl);
      return u.pathname + (u.search || "");
    } catch {
      // fallback: try best-effort replace
      return formUrl.replace("http://localhost:8081", "");
    }
  }

  async function copy(text: string) {
    await Clipboard.setStringAsync(text);
    if (Platform.OS === "web") {
      // @ts-ignore
      window.alert("Copied!");
    } else {
      notify("Copied", "Form link copied to clipboard.");
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
    setFieldErrors({}); // clear old errors

    try {
      const emp = await apiPost<EmployeeOut>(
        `/admin/companies/${companyIdStr}/employees`,
        payload
      );

      setCreated(emp);
      setStatus("✅ Employee created.");
    } catch (err: any) {
      const msg = err?.message || "Failed to create employee";

      // Best-effort: if backend returns unique violation message
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
    } finally {
      setSubmitting(false);
    }
  }

  // ------------------ SUCCESS SCREEN ------------------
  if (created) {
    const formUrl = created.form_url ?? null;
    const formPath = formPathFromUrl(formUrl);

    return (
      <ScrollView
        contentContainerStyle={{
          padding: 20,
          gap: 12,
          width: "100%",
          ...(Platform.OS === "web" ? { maxWidth: 600, alignSelf: "center" as const } : {}),
        }}
      >
        <Text style={{ fontSize: 22, fontWeight: "700" }}>Employee Created</Text>
        <Text style={{ opacity: 0.7 }}>
          {created.name} • {created.email}
        </Text>

        <View
          style={{
            marginTop: 6,
            padding: 12,
            borderWidth: 1,
            borderColor: "#ddd",
            borderRadius: 10,
            gap: 8,
          }}
        >
          <Text style={{ fontWeight: "700" }}>Form link</Text>
          {formUrl ? (
            <>
              <Text selectable style={{ fontSize: 12 }}>
                {formUrl}
              </Text>
              <View style={{ flexDirection: "row", gap: 10, marginTop: 6 }}>
                <Button
                  label="Copy link"
                  variant="primary"
                  onPress={() => copy(formUrl)}
                />
                <Button
                  label="Open form"
                  variant="secondary"
                  disabled={!formPath}
                  onPress={() => {
                    if (!formPath) return;
                    router.push(formPath as any);
                  }}
                />
              </View>
            </>
          ) : (
            <Text style={{ color: "crimson" }}>
              form_url missing from API response. (Backend should return it.)
            </Text>
          )}
        </View>

        <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
          <Button
            label="Add another"
            variant="secondary"
            onPress={() => {
              // reset form but stay on page
              setCreated(null);
              setName("");
              setEmail("");
              setPhone("");
              setHireDate("");
              setStatus("");
              setTouched({
                name: false,
                email: false,
                phone: false,
                hireDate: false,
              });
              setFieldErrors({});
            }}
          />
          <Button
            label="Back to dashboard"
            variant="primary"
            onPress={() => router.replace(`/admin/${companyIdStr}` as any)}
          />
        </View>

        {!!status && <Text style={{ opacity: 0.75 }}>{status}</Text>}
      </ScrollView>
    );
  }

  // ------------------ FORM SCREEN ------------------
  const showNameErr = touched.name && !!fieldErrors.name;
  const showEmailErr = touched.email && !!fieldErrors.email;
  const showHireErr = touched.hireDate && !!fieldErrors.hireDate;

  return (
    <ScrollView
      contentContainerStyle={{
        padding: 20,
        gap: 12,
        width: "100%",
        ...(Platform.OS === "web" ? { maxWidth: 600, alignSelf: "center" as const } : {}),
      }}
    >
      <Text style={{ fontSize: 22, fontWeight: "700" }}>Add Employee</Text>
      <Text style={{ opacity: 0.65 }}>Company: {companyIdStr}</Text>

      {!!fieldErrors.general && (
        <Text style={{ color: "crimson" }}>{fieldErrors.general}</Text>
      )}

      <View style={{ gap: 8, marginTop: 10 }}>
        <InputLabel>Name *</InputLabel>
        <TextInput
          value={name}
          onChangeText={(v) => {
            setName(v);
            if (touched.name) setFieldErrors((p) => ({ ...p, ...validate({ name: v }) }));
          }}
          onBlur={() => setTouched((t) => ({ ...t, name: true }))}
          placeholder="Jane Coach"
          placeholderTextColor="#999"
          editable={!submitting}
          style={{
            borderWidth: 1,
            borderColor: showNameErr ? "crimson" : "#ddd",
            borderRadius: 10,
            padding: 12,
          }}
        />
        {showNameErr && <ErrorText>{fieldErrors.name}</ErrorText>}

        <InputLabel>Email *</InputLabel>
        <TextInput
          value={email}
          onChangeText={(v) => {
            setEmail(v);
            if (touched.email) setFieldErrors((p) => ({ ...p, ...validate({ email: v }) }));
          }}
          onBlur={() => setTouched((t) => ({ ...t, email: true }))}
          placeholder="jane@otfroyaloak.com"
          placeholderTextColor="#999"
          autoCapitalize="none"
          keyboardType="email-address"
          editable={!submitting}
          style={{
            borderWidth: 1,
            borderColor: showEmailErr ? "crimson" : "#ddd",
            borderRadius: 10,
            padding: 12,
          }}
        />
        {showEmailErr && <ErrorText>{fieldErrors.email}</ErrorText>}

        <InputLabel>Phone (optional)</InputLabel>
        <TextInput
          value={phone}
          onChangeText={setPhone}
          onBlur={() => setTouched((t) => ({ ...t, phone: true }))}
          placeholder="248-555-1234"
          placeholderTextColor="#999"
          editable={!submitting}
          style={{
            borderWidth: 1,
            borderColor: "#ddd",
            borderRadius: 10,
            padding: 12,
          }}
        />

        <InputLabel>Hire Date (optional)</InputLabel>
        <TextInput
          value={hireDate}
          onChangeText={(v) => {
            setHireDate(v);
            if (touched.hireDate)
              setFieldErrors((p) => ({ ...p, ...validate({ hireDate: v }) }));
          }}
          onBlur={() => setTouched((t) => ({ ...t, hireDate: true }))}
          placeholder="YYYY-MM-DD (example: 2026-01-15)"
          placeholderTextColor="#999"
          autoCapitalize="none"
          editable={!submitting}
          style={{
            borderWidth: 1,
            borderColor: showHireErr ? "crimson" : "#ddd",
            borderRadius: 10,
            padding: 12,
          }}
        />
        {showHireErr && <ErrorText>{fieldErrors.hireDate}</ErrorText>}
      </View>

      <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
        <Button
          label="Cancel"
          variant="secondary"
          disabled={submitting}
          onPress={() => router.replace(`/admin/${companyIdStr}` as any)}
        />
        <Button
          label={submitting ? "Creating..." : "Create"}
          variant="primary"
          disabled={submitting}
          onPress={submit}
        />
      </View>

      {!!status && <Text style={{ opacity: 0.75 }}>{status}</Text>}
    </ScrollView>
  );
}

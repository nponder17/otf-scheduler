import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocalSearchParams } from "expo-router";
import { View, Text, Pressable, ScrollView, Platform, Image } from "react-native";
import * as Clipboard from "expo-clipboard";
import { apiGet, apiPost, getApiBase } from "../../../lib/api";

/**
 * ✅ Web base (what you send employees)
 * - Local fallback: http://localhost:8081
 * - Ngrok: set EXPO_PUBLIC_WEB_BASE=https://xxxx.ngrok.app
 */
const WEB_BASE_RAW =
  (process.env.EXPO_PUBLIC_WEB_BASE as string) || "https://otf-scheduler-web.onrender.com";

// normalize: remove trailing slash
const WEB_BASE = WEB_BASE_RAW.replace(/\/+$/, "");


type Company = {
  company_id: string;
  name: string;
  timezone: string;
  logo_url?: string | null;
};

type Employee = {
  employee_id: string;
  company_id: string;
  name: string;
  email: string;
  phone: string | null;
  hire_date: string | null;
  is_active: boolean;
};

export default function CompanyAdmin() {
  const { companyId } = useLocalSearchParams<{ companyId: string }>();
  const companyIdStr = useMemo(() => String(companyId || ""), [companyId]);

  const [company, setCompany] = useState<Company | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [err, setErr] = useState<string>("");

  const [logoFailed, setLogoFailed] = useState(false);
  const [logoBust, setLogoBust] = useState<number>(Date.now());

  const [clearingForms, setClearingForms] = useState(false);
  const [clearingSchedule, setClearingSchedule] = useState(false);

  async function load() {
    try {
      setErr("");

      const [c, emps] = await Promise.all([
        apiGet<Company>(`/admin/companies/${companyIdStr}`),
        apiGet<Employee[]>(`/admin/companies/${companyIdStr}/employees`),
      ]);

      setCompany((prev) => {
        if (!prev || prev.company_id !== c.company_id || prev.logo_url !== c.logo_url) {
          setLogoFailed(false);
          setLogoBust(Date.now());
        }
        return c;
      });

      setEmployees(emps);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load dashboard");
    }
  }

  useEffect(() => {
    if (!companyIdStr || companyIdStr === "undefined") return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyIdStr]);

  async function copy(text: string) {
    await Clipboard.setStringAsync(text);
    if (Platform.OS === "web") {
      // @ts-ignore
      window.alert("Copied!");
    }
  }

  const title = company?.name || "Company Dashboard";
  const subtitle = company?.timezone || "";

  const API_BASE = getApiBase();

  const proxiedLogoUrl = useMemo(() => {
    if (!companyIdStr) return "";
    return `${API_BASE}/admin/companies/${companyIdStr}/logo?bust=${logoBust}`;
  }, [API_BASE, companyIdStr, logoBust]);

  const logoFileName = useMemo(() => {
    const raw = (company?.logo_url || "").trim();
    if (!raw) return "";
    try {
      const parts = raw.split("?")[0].split("#")[0].split("/");
      return parts[parts.length - 1] || "";
    } catch {
      return "";
    }
  }, [company?.logo_url]);

  const showLogo = !!companyIdStr && !!company && !logoFailed;

  async function clearAllFormSubmissions() {
    if (!companyIdStr) return;

    const ok =
      Platform.OS === "web"
        ? // @ts-ignore
          window.confirm(
            "This will delete ALL form submissions for this company:\n\n" +
              "- availability\n- unavailability\n- time off\n- PTO\n- submissions log\n\n" +
              "Employees will need to re-submit.\n\nContinue?"
          )
        : true;

    if (!ok) return;

    try {
      setClearingForms(true);
      setErr("");

      const data = await apiPost<any>(`/admin/companies/${companyIdStr}/forms/clear`, {});
      const deleted = data?.deleted ?? {};
      const total = data?.total_deleted ?? 0;

      if (Platform.OS === "web") {
        // @ts-ignore
        window.alert(
          `Cleared form submissions ✅\n\nTotal rows deleted: ${total}\n` +
            Object.entries(deleted)
              .map(([k, v]) => `${k}: ${v}`)
              .join("\n")
        );
      }

      await load();
    } catch (e: any) {
      setErr(e?.message ?? "Failed to clear forms");
    } finally {
      setClearingForms(false);
    }
  }

  async function clearScheduleArtifacts() {
    if (!companyIdStr) return;

    const ok =
      Platform.OS === "web"
        ? // @ts-ignore
          window.confirm(
            "This will delete ALL schedule artifacts for this company:\n\n" +
              "- schedule_runs\n- scheduled_shifts\n- audit tables\n\n" +
              "You can regenerate immediately.\n\nContinue?"
          )
        : true;

    if (!ok) return;

    try {
      setClearingSchedule(true);
      setErr("");

      const data = await apiPost<any>(`/admin/companies/${companyIdStr}/schedule/clear`, {});
      const deleted = data?.deleted ?? {};

      if (Platform.OS === "web") {
        // @ts-ignore
        window.alert(
          "Cleared schedule artifacts ✅\n\n" +
            Object.entries(deleted)
              .map(([k, v]) => `${k}: ${v}`)
              .join("\n")
        );
      }
    } catch (e: any) {
      setErr(e?.message ?? "Failed to clear schedule");
    } finally {
      setClearingSchedule(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }}>
      <View style={{ alignItems: "center", gap: 8, marginBottom: 6 }}>
        {showLogo ? (
          <Image
            source={{ uri: proxiedLogoUrl }}
            style={{ width: 300, height: 200 }}
            resizeMode="contain"
            onError={(ev) => {
              console.log("Logo failed to load:", ev?.nativeEvent);
              setLogoFailed(true);
            }}
          />
        ) : (
          <View
            style={{
              width: 120,
              height: 120,
              borderRadius: 16,
              backgroundColor: "#111",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: "white", fontWeight: "900", fontSize: 42 }}>
              {company?.name?.slice(0, 1)?.toUpperCase() ?? "C"}
            </Text>
          </View>
        )}

        <Text style={{ fontSize: 26, fontWeight: "800", textAlign: "center" }}>{title}</Text>

        {!!subtitle && <Text style={{ opacity: 0.7, textAlign: "center" }}>{subtitle}</Text>}

        {!!logoFileName && (
          <Text style={{ opacity: 0.55, fontSize: 12 }}>Logo: {logoFileName}</Text>
        )}
      </View>

      <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
        <Link href={`/admin/${companyIdStr}/add`} asChild>
          <Pressable style={{ padding: 12, borderRadius: 10, backgroundColor: "#111" }}>
            <Text style={{ color: "white", fontWeight: "700" }}>Add employee</Text>
          </Pressable>
        </Link>

        <Pressable
          onPress={() => {
            setLogoFailed(false);
            setLogoBust(Date.now());
            load();
          }}
          style={{ padding: 12, borderRadius: 10, borderWidth: 1, borderColor: "#ddd" }}
        >
          <Text style={{ fontWeight: "700" }}>Refresh</Text>
        </Pressable>

        <Pressable
          onPress={clearAllFormSubmissions}
          disabled={clearingForms}
          style={{
            padding: 12,
            borderRadius: 10,
            backgroundColor: clearingForms ? "#6b7280" : "#ef4444",
            opacity: clearingForms ? 0.7 : 1,
          }}
        >
          <Text style={{ color: "white", fontWeight: "800" }}>
            {clearingForms ? "Clearing forms..." : "Clear form submissions"}
          </Text>
        </Pressable>

        <Pressable
          onPress={clearScheduleArtifacts}
          disabled={clearingSchedule}
          style={{
            padding: 12,
            borderRadius: 10,
            backgroundColor: clearingSchedule ? "#6b7280" : "#f59e0b",
            opacity: clearingSchedule ? 0.8 : 1,
          }}
        >
          <Text style={{ color: "black", fontWeight: "900" }}>
            {clearingSchedule ? "Clearing schedule..." : "Clear schedule artifacts"}
          </Text>
        </Pressable>
      </View>

      {!!err && <Text style={{ color: "crimson" }}>{err}</Text>}

      {employees.length === 0 ? (
        <Text>No employees yet.</Text>
      ) : (
        <View style={{ gap: 10 }}>
          {employees.map((e) => {
            const formPath = `/form/${e.employee_id}`;
            const formUrl = `${WEB_BASE}${formPath}`;

            return (
              <View
                key={e.employee_id}
                style={{
                  padding: 12,
                  borderWidth: 1,
                  borderColor: "#ddd",
                  borderRadius: 10,
                  gap: 6,
                }}
              >
                <Text style={{ fontWeight: "700" }}>{e.name}</Text>
                <Text style={{ opacity: 0.8 }}>{e.email}</Text>

                <Text style={{ fontSize: 12, opacity: 0.65 }}>Form link:</Text>
                <Text selectable style={{ fontSize: 12 }}>
                  {formUrl}
                </Text>

                <View style={{ flexDirection: "row", gap: 10, marginTop: 6 }}>
                  <Pressable
                    onPress={() => copy(formUrl)}
                    style={{
                      paddingVertical: 10,
                      paddingHorizontal: 12,
                      borderRadius: 10,
                      backgroundColor: "#2563eb",
                    }}
                  >
                    <Text style={{ color: "white", fontWeight: "700" }}>Copy link</Text>
                  </Pressable>

                  <Link href={formPath} asChild>
                    <Pressable
                      style={{
                        paddingVertical: 10,
                        paddingHorizontal: 12,
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: "#ddd",
                      }}
                    >
                      <Text style={{ fontWeight: "700" }}>Open form</Text>
                    </Pressable>
                  </Link>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

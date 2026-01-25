import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { View, Text, Pressable, ScrollView, Platform } from "react-native";
import { apiGet } from "../../../lib/api";

type ScheduleRun = {
  schedule_run_id: string;
  company_id: string;
  studio_id: string;
  studio_name: string | null;
  month_start: string;
  month_end: string;
  created_at: string;
  shift_count: number;
};

export default function SchedulesList() {
  const router = useRouter();
  const { companyId } = useLocalSearchParams<{ companyId: string }>();
  const companyIdStr = useMemo(() => String(companyId || ""), [companyId]);

  const isValidCompanyId = !!companyIdStr && companyIdStr !== "undefined";

  const [runs, setRuns] = useState<ScheduleRun[]>([]);
  const [err, setErr] = useState<string>("");
  const [loading, setLoading] = useState(false);

  async function load() {
    if (!isValidCompanyId) return;

    try {
      setLoading(true);
      setErr("");

      const data = await apiGet<{ runs: ScheduleRun[] }>(
        `/schedules/company/${companyIdStr}/runs`
      );

      setRuns(data.runs || []);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load schedules");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyIdStr]);

  function formatDate(dateStr: string) {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    } catch {
      return dateStr;
    }
  }

  function formatDateRange(start: string, end: string) {
    return `${formatDate(start)} - ${formatDate(end)}`;
  }

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
        <Text style={{ fontSize: 22, fontWeight: "700" }}>Schedules</Text>
      </View>

      {!isValidCompanyId ? (
        <Text style={{ color: "crimson" }}>
          Missing/invalid companyId in route. This page should be /admin/&lt;companyId&gt;/schedules
        </Text>
      ) : (
        <>
          <Pressable
            onPress={load}
            disabled={loading}
            style={{
              padding: 12,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: "#ddd",
              opacity: loading ? 0.6 : 1,
              alignSelf: "flex-start",
            }}
          >
            <Text style={{ fontWeight: "700" }}>{loading ? "Loading..." : "Refresh"}</Text>
          </Pressable>

          {!!err && <Text style={{ color: "crimson" }}>{err}</Text>}

          {runs.length === 0 ? (
            <Text style={{ opacity: 0.7 }}>No schedules found. Generate one first.</Text>
          ) : (
            <View style={{ gap: 10 }}>
              {runs.map((run) => (
                <Link
                  key={run.schedule_run_id}
                  href={`/admin/${companyIdStr}/schedules/${run.schedule_run_id}`}
                  asChild
                >
                  <Pressable
                    style={{
                      padding: 16,
                      borderWidth: 1,
                      borderColor: "#ddd",
                      borderRadius: 10,
                      gap: 8,
                    }}
                  >
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontWeight: "700", fontSize: 16 }}>
                          {run.studio_name || "Studio"}
                        </Text>
                        <Text style={{ opacity: 0.7, marginTop: 4 }}>
                          {formatDateRange(run.month_start, run.month_end)}
                        </Text>
                        <Text style={{ opacity: 0.6, fontSize: 12, marginTop: 4 }}>
                          {run.shift_count} shift{run.shift_count !== 1 ? "s" : ""}
                        </Text>
                      </View>
                      <Text style={{ opacity: 0.5, fontSize: 12 }}>
                        {formatDate(run.created_at)}
                      </Text>
                    </View>
                    <Text style={{ color: "#2563eb", fontWeight: "600", marginTop: 4 }}>
                      View & Edit →
                    </Text>
                  </Pressable>
                </Link>
              ))}
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}


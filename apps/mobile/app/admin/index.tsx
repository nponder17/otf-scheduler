import React, { useEffect, useState } from "react";
import { Link } from "expo-router";
import { View, Text, Pressable, ScrollView } from "react-native";
import { apiGet } from "../../lib/api";

type Company = {
  company_id: string;
  name: string;
  timezone: string;
};

export default function AdminIndex() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [err, setErr] = useState<string>("");

  useEffect(() => {
    (async () => {
      try {
        setErr("");
        const data = await apiGet<Company[]>("/admin/companies");
        setCompanies(data);
      } catch (e: any) {
        setErr(e?.message ?? "Failed to load companies");
      }
    })();
  }, []);

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }}>
      <Text style={{ fontSize: 22, fontWeight: "700" }}>Admin</Text>

      {!!err && <Text style={{ color: "crimson" }}>{err}</Text>}

      {companies.length === 0 ? (
        <Text>No companies yet.</Text>
      ) : (
        <View style={{ gap: 10 }}>
          {companies.map((c) => (
            <Link key={c.company_id} href={`/admin/${c.company_id}`} asChild>
              <Pressable
                style={{
                  padding: 12,
                  borderWidth: 1,
                  borderColor: "#ddd",
                  borderRadius: 10,
                }}
              >
                <Text style={{ fontWeight: "700" }}>{c.name}</Text>
                <Text style={{ opacity: 0.7 }}>{c.timezone}</Text>
                <Text style={{ opacity: 0.6, fontSize: 12 }}>
                  {c.company_id}
                </Text>
              </Pressable>
            </Link>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

import React, { useEffect, useState } from "react";
import { Link, useRouter } from "expo-router";
import { View, Text, Pressable, ScrollView, Platform } from "react-native";
import { apiGet } from "../../lib/api";
import AsyncStorage from "@react-native-async-storage/async-storage";

type Company = {
  company_id: string;
  name: string;
  timezone: string;
};

export default function AdminIndex() {
  const router = useRouter();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [err, setErr] = useState<string>("");

  useEffect(() => {
    checkAuth();
    loadCompanies();
  }, []);

  async function checkAuth() {
    const token = await AsyncStorage.getItem("auth_token");
    const role = await AsyncStorage.getItem("user_role");
    // Allow managers and system admins
    if (!token || (role !== "manager" && role !== "system_admin")) {
      // Redirect based on role - managers go to manager login, system admins to system admin login
      if (role === "system_admin") {
        router.replace("/system-admin/login" as any);
      } else {
        router.replace("/manager/login" as any);
      }
      return;
    }
  }

  async function loadCompanies() {
    try {
      setErr("");
      const data = await apiGet<Company[]>("/admin/companies");
      setCompanies(data);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load companies");
    }
  }

  return (
    <ScrollView
      contentContainerStyle={{
        padding: 20,
        gap: 12,
        width: "100%",
        ...(Platform.OS === "web" ? { maxWidth: 600, alignSelf: "center" as const } : {}),
      }}
    >
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

import { Link, useRouter } from "expo-router";
import { View, Text, Pressable } from "react-native";

export default function Home() {
  const router = useRouter();
  
  return (
    <View style={{ padding: 20, gap: 12, backgroundColor: "#0b0f14", flex: 1 }}>
      <Text style={{ fontSize: 22, fontWeight: "700", color: "#e9eaec", marginBottom: 20 }}>Scheduler Mobile</Text>

      <Pressable
        onPress={() => {
          try {
            router.push("/login" as any);
          } catch (e) {
            console.error("Navigation error:", e);
            // Fallback: try replace
            router.replace("/login" as any);
          }
        }}
        style={{
          padding: 14,
          backgroundColor: "#1f6feb",
          borderRadius: 12,
          marginBottom: 12,
        }}
      >
        <Text style={{ color: "white", fontWeight: "700", textAlign: "center", fontSize: 16 }}>
          Employee Login
        </Text>
      </Pressable>

      <Pressable
        onPress={() => router.push("/manager/login" as any)}
        style={{
          padding: 14,
          backgroundColor: "#2563eb",
          borderRadius: 12,
          marginBottom: 12,
        }}
      >
        <Text style={{ color: "white", fontWeight: "700", textAlign: "center", fontSize: 16 }}>
          Manager Login
        </Text>
      </Pressable>

      <Pressable
        onPress={() => router.push("/system-admin/login" as any)}
        style={{
          padding: 14,
          backgroundColor: "#7c3aed",
          borderRadius: 12,
          marginBottom: 12,
        }}
      >
        <Text style={{ color: "white", fontWeight: "700", textAlign: "center", fontSize: 16 }}>
          System Admin Login
        </Text>
      </Pressable>

      <Link href="/admin" asChild>
        <Pressable
          style={{
            padding: 12,
            backgroundColor: "#2a2a2a",
            borderRadius: 8,
            borderWidth: 1,
            borderColor: "#444",
          }}
        >
          <Text style={{ color: "#e9eaec", textAlign: "center" }}>Open Admin</Text>
        </Pressable>
      </Link>

      <Link href="/form/00000000-0000-0000-0000-000000000000" asChild>
        <Pressable
          style={{
            padding: 12,
            backgroundColor: "#2a2a2a",
            borderRadius: 8,
            borderWidth: 1,
            borderColor: "#444",
          }}
        >
          <Text style={{ color: "#e9eaec", textAlign: "center" }}>Open sample form</Text>
        </Pressable>
      </Link>
    </View>
  );
}

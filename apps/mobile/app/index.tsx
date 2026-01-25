import { Link } from "expo-router";
import { View, Text } from "react-native";

export default function Home() {
  return (
    <View style={{ padding: 20, gap: 12 }}>
      <Text style={{ fontSize: 22, fontWeight: "700" }}>Scheduler Mobile</Text>

      <Link href="/login" style={{ padding: 12, backgroundColor: "#1f6feb", borderRadius: 8, textAlign: "center" }}>
        <Text style={{ color: "white", fontWeight: "700" }}>Employee Login</Text>
      </Link>

      <Link href="/admin">Open Admin</Link>

      <Link href="/form/00000000-0000-0000-0000-000000000000">
        Open sample form
      </Link>
    </View>
  );
}

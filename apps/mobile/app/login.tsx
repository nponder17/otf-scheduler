import React, { useState } from "react";
import { View, Text, TextInput, Pressable, Alert, ScrollView, Platform } from "react-native";
import { useRouter } from "expo-router";
import { apiPost } from "../lib/api";
import AsyncStorage from "@react-native-async-storage/async-storage";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleLogin() {
    if (!email || !password) {
      Alert.alert("Error", "Please enter both email and password");
      return;
    }

    setLoading(true);
    try {
      const response = await apiPost<{
        access_token: string;
        employee_id: string;
        name: string;
        email: string;
        company_id: string;
      }>("/auth/login", {
        email: email.toLowerCase().trim(),
        password,
      });

      // Store token and user info
      await AsyncStorage.setItem("auth_token", response.access_token);
      await AsyncStorage.setItem("employee_id", response.employee_id);
      await AsyncStorage.setItem("employee_name", response.name);
      await AsyncStorage.setItem("company_id", response.company_id);

      // Navigate to employee schedule
      router.replace("/employee/schedule" as any);
    } catch (error: any) {
      Alert.alert("Login Failed", error?.message || "Invalid email or password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "#0b0f14" }}
      contentContainerStyle={{
        padding: 20,
        width: "100%",
        ...(Platform.OS === "web" ? { maxWidth: 600, alignSelf: "center" as const } : {}),
      }}
    >
      <Text style={{ fontSize: 34, fontWeight: "800", color: "#e9eaec", marginBottom: 10, textAlign: "center" }}>
        Employee Login
      </Text>

      <View style={{ marginBottom: 16 }}>
        <Text style={{ color: "#e9eaec", opacity: 0.8, marginBottom: 6 }}>Email</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="your.email@example.com"
          placeholderTextColor="#888"
          autoCapitalize="none"
          keyboardType="email-address"
          returnKeyType="next"
          onSubmitEditing={() => {
            passwordInputRef.current?.focus();
          }}
          style={{
            padding: 12,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: "#444",
            backgroundColor: "#1a1a1a",
            color: "#e9eaec",
          }}
        />
      </View>

      <View style={{ marginBottom: 16 }}>
        <Text style={{ color: "#e9eaec", opacity: 0.8, marginBottom: 6 }}>Password</Text>
        <TextInput
          ref={passwordInputRef}
          value={password}
          onChangeText={setPassword}
          placeholder="Enter your password"
          placeholderTextColor="#888"
          secureTextEntry
          returnKeyType="done"
          onSubmitEditing={handleLogin}
          editable={!loading}
          style={{
            padding: 12,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: "#444",
            backgroundColor: "#1a1a1a",
            color: "#e9eaec",
          }}
        />
      </View>

      <Pressable
        onPress={handleLogin}
        disabled={loading}
        style={{
          padding: 14,
          borderRadius: 16,
          backgroundColor: loading ? "#6b7280" : "#1f6feb",
          opacity: loading ? 0.5 : 1,
          marginBottom: 12,
        }}
      >
        <Text style={{ color: "white", fontWeight: "700", textAlign: "center" }}>
          {loading ? "Logging in..." : "Login"}
        </Text>
      </Pressable>

      <Text style={{ color: "#9aa4b2", fontSize: 12, textAlign: "center", marginTop: 20 }}>
        Contact your manager if you need to reset your password
      </Text>
    </ScrollView>
  );
}


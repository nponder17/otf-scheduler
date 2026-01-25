import React, { useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, Platform, Alert, Modal, TextInput } from "react-native";
import { useRouter } from "expo-router";
import { apiGet, apiPost, apiPut, apiDelete } from "../../lib/api";
import AsyncStorage from "@react-native-async-storage/async-storage";

type Company = {
  company_id: string;
  name: string;
  timezone: string;
};

type Manager = {
  manager_id: string;
  company_id: string;
  name: string;
  email: string;
  is_active: boolean;
};

type Employee = {
  employee_id: string;
  company_id: string;
  name: string;
  email: string;
  phone: string | null;
  is_active: boolean;
};

export default function SystemAdminDashboard() {
  const router = useRouter();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>("");

  // Modals
  const [showAddCompany, setShowAddCompany] = useState(false);
  const [showAddManager, setShowAddManager] = useState(false);
  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [showEditEmployee, setShowEditEmployee] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);

  // Form states
  const [newCompanyName, setNewCompanyName] = useState("");
  const [newCompanyTimezone, setNewCompanyTimezone] = useState("America/New_York");
  const [newManagerName, setNewManagerName] = useState("");
  const [newManagerEmail, setNewManagerEmail] = useState("");
  const [newManagerPassword, setNewManagerPassword] = useState("");
  const [newEmployeeName, setNewEmployeeName] = useState("");
  const [newEmployeeEmail, setNewEmployeeEmail] = useState("");
  const [newEmployeePhone, setNewEmployeePhone] = useState("");
  const [editEmployeeName, setEditEmployeeName] = useState("");
  const [editEmployeeEmail, setEditEmployeeEmail] = useState("");
  const [editEmployeePhone, setEditEmployeePhone] = useState("");
  const [editEmployeeHireDate, setEditEmployeeHireDate] = useState("");

  useEffect(() => {
    checkAuth();
    loadCompanies();
  }, []);

  useEffect(() => {
    if (selectedCompany) {
      loadManagers();
      loadEmployees();
    }
  }, [selectedCompany]);

  async function checkAuth() {
    const token = await AsyncStorage.getItem("auth_token");
    const role = await AsyncStorage.getItem("user_role");
    if (!token || role !== "system_admin") {
      router.replace("/system-admin/login" as any);
      return;
    }
  }

  async function loadCompanies() {
    setLoading(true);
    setErr("");
    try {
      const data = await apiGet<Company[]>("/system-admin/companies");
      setCompanies(data);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load companies");
    } finally {
      setLoading(false);
    }
  }

  async function loadManagers() {
    if (!selectedCompany) return;
    setLoading(true);
    try {
      const data = await apiGet<Manager[]>(`/system-admin/companies/${selectedCompany.company_id}/managers`);
      setManagers(data);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to load managers");
    } finally {
      setLoading(false);
    }
  }

  async function loadEmployees() {
    if (!selectedCompany) return;
    setLoading(true);
    try {
      const data = await apiGet<Employee[]>(`/system-admin/companies/${selectedCompany.company_id}/employees`);
      setEmployees(data);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to load employees");
    } finally {
      setLoading(false);
    }
  }

  async function handleAddCompany() {
    if (!newCompanyName.trim()) {
      Alert.alert("Error", "Please enter a company name");
      return;
    }
    setLoading(true);
    try {
      const newCompany = await apiPost<Company>("/system-admin/companies", {
        name: newCompanyName.trim(),
        timezone: newCompanyTimezone,
      });
      setCompanies([...companies, newCompany]);
      setShowAddCompany(false);
      setNewCompanyName("");
      Alert.alert("Success", "Company created successfully");
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to create company");
    } finally {
      setLoading(false);
    }
  }

  async function handleAddManager() {
    if (!selectedCompany) return;
    if (!newManagerName.trim() || !newManagerEmail.trim() || !newManagerPassword.trim()) {
      Alert.alert("Error", "Please fill in all fields");
      return;
    }
    setLoading(true);
    try {
      await apiPost(`/system-admin/managers`, {
        company_id: selectedCompany.company_id,
        name: newManagerName.trim(),
        email: newManagerEmail.trim(),
        password: newManagerPassword,
      });
      setShowAddManager(false);
      setNewManagerName("");
      setNewManagerEmail("");
      setNewManagerPassword("");
      loadManagers();
      Alert.alert("Success", "Manager created successfully");
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to create manager");
    } finally {
      setLoading(false);
    }
  }

  async function handleAddEmployee() {
    if (!selectedCompany) return;
    if (!newEmployeeName.trim() || !newEmployeeEmail.trim()) {
      Alert.alert("Error", "Please fill in name and email");
      return;
    }
    setLoading(true);
    try {
      await apiPost(`/system-admin/companies/${selectedCompany.company_id}/employees`, {
        name: newEmployeeName.trim(),
        email: newEmployeeEmail.trim(),
        phone: newEmployeePhone.trim() || null,
        hire_date: null,
      });
      setShowAddEmployee(false);
      setNewEmployeeName("");
      setNewEmployeeEmail("");
      setNewEmployeePhone("");
      loadEmployees();
      Alert.alert("Success", "Employee created successfully");
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to create employee");
    } finally {
      setLoading(false);
    }
  }

  function handleEditEmployee(employee: Employee) {
    setEditingEmployee(employee);
    setEditEmployeeName(employee.name);
    setEditEmployeeEmail(employee.email);
    setEditEmployeePhone(employee.phone || "");
    setEditEmployeeHireDate(employee.hire_date ? employee.hire_date.split("T")[0] : "");
    setShowEditEmployee(true);
  }

  async function handleUpdateEmployee() {
    if (!editingEmployee) return;
    if (!editEmployeeName.trim() || !editEmployeeEmail.trim()) {
      Alert.alert("Error", "Please fill in name and email");
      return;
    }
    setLoading(true);
    try {
      await apiPut(`/system-admin/employees/${editingEmployee.employee_id}`, {
        name: editEmployeeName.trim(),
        email: editEmployeeEmail.trim(),
        phone: editEmployeePhone.trim() || null,
        hire_date: editEmployeeHireDate || null,
      });
      setShowEditEmployee(false);
      setEditingEmployee(null);
      loadEmployees();
      Alert.alert("Success", "Employee updated successfully");
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to update employee");
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteEmployee(employeeId: string, employeeName: string) {
    Alert.alert(
      "Delete Employee",
      `Are you sure you want to delete ${employeeName}? This action cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setLoading(true);
            try {
              await apiDelete(`/system-admin/employees/${employeeId}`);
              loadEmployees();
              Alert.alert("Success", "Employee deleted successfully");
            } catch (e: any) {
              Alert.alert("Error", e?.message ?? "Failed to delete employee");
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  }

  function handleLogout() {
    Alert.alert("Logout", "Are you sure you want to logout?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Logout",
        style: "destructive",
        onPress: async () => {
          await AsyncStorage.multiRemove(["auth_token", "user_role", "user_id", "user_name"]);
          router.replace("/system-admin/login" as any);
        },
      },
    ]);
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "#0b0f14" }}
      contentContainerStyle={{
        padding: 18,
        width: "100%",
        ...(Platform.OS === "web" ? { maxWidth: 1400, alignSelf: "center" as const } : {}),
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <Text style={{ fontSize: 34, fontWeight: "800", color: "#e9eaec" }}>System Admin</Text>
        <Pressable
          onPress={handleLogout}
          style={{
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 8,
            backgroundColor: "#444",
          }}
        >
          <Text style={{ color: "#e9eaec", fontWeight: "700", fontSize: 12 }}>Logout</Text>
        </Pressable>
      </View>

      {!!err && <Text style={{ color: "crimson", marginBottom: 12 }}>{err}</Text>}

      {/* Companies Section */}
      <View style={{ marginBottom: 24 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <Text style={{ fontSize: 24, fontWeight: "700", color: "#e9eaec" }}>Companies</Text>
          <Pressable
            onPress={() => setShowAddCompany(true)}
            style={{
              padding: 10,
              borderRadius: 8,
              backgroundColor: "#2563eb",
            }}
          >
            <Text style={{ color: "white", fontWeight: "700" }}>+ Add Company</Text>
          </Pressable>
        </View>

        {companies.length === 0 ? (
          <Text style={{ color: "#9aa4b2" }}>No companies yet.</Text>
        ) : (
          <View style={{ gap: 10 }}>
            {companies.map((c) => (
              <Pressable
                key={c.company_id}
                onPress={() => setSelectedCompany(c)}
                style={{
                  padding: 16,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: selectedCompany?.company_id === c.company_id ? "#2563eb" : "#444",
                  backgroundColor: selectedCompany?.company_id === c.company_id ? "#1e3a8a" : "#1a1a1a",
                }}
              >
                <Text style={{ color: "#e9eaec", fontWeight: "700", fontSize: 18 }}>{c.name}</Text>
                <Text style={{ color: "#9aa4b2", fontSize: 14 }}>{c.timezone}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      {/* Selected Company Details */}
      {selectedCompany && (
        <View style={{ marginTop: 24 }}>
          <Text style={{ fontSize: 24, fontWeight: "700", color: "#e9eaec", marginBottom: 16 }}>
            {selectedCompany.name}
          </Text>

          {/* Managers Section */}
          <View style={{ marginBottom: 24 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <Text style={{ fontSize: 20, fontWeight: "700", color: "#e9eaec" }}>Managers</Text>
              <Pressable
                onPress={() => setShowAddManager(true)}
                style={{
                  padding: 8,
                  borderRadius: 8,
                  backgroundColor: "#2563eb",
                }}
              >
                <Text style={{ color: "white", fontWeight: "700", fontSize: 14 }}>+ Add Manager</Text>
              </Pressable>
            </View>

            {managers.length === 0 ? (
              <Text style={{ color: "#9aa4b2" }}>No managers yet.</Text>
            ) : (
              <View style={{ gap: 8 }}>
                {managers.map((m) => (
                  <View
                    key={m.manager_id}
                    style={{
                      padding: 12,
                      borderRadius: 8,
                      backgroundColor: "#1a1a1a",
                      borderWidth: 1,
                      borderColor: "#444",
                    }}
                  >
                    <Text style={{ color: "#e9eaec", fontWeight: "600" }}>{m.name}</Text>
                    <Text style={{ color: "#9aa4b2", fontSize: 14 }}>{m.email}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Employees Section */}
          <View>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <Text style={{ fontSize: 20, fontWeight: "700", color: "#e9eaec" }}>Employees</Text>
              <Pressable
                onPress={() => setShowAddEmployee(true)}
                style={{
                  padding: 8,
                  borderRadius: 8,
                  backgroundColor: "#2563eb",
                }}
              >
                <Text style={{ color: "white", fontWeight: "700", fontSize: 14 }}>+ Add Employee</Text>
              </Pressable>
            </View>

            {employees.length === 0 ? (
              <Text style={{ color: "#9aa4b2" }}>No employees yet.</Text>
            ) : (
              <View style={{ gap: 8 }}>
                {employees.map((e) => (
                  <View
                    key={e.employee_id}
                    style={{
                      padding: 12,
                      borderRadius: 8,
                      backgroundColor: "#1a1a1a",
                      borderWidth: 1,
                      borderColor: "#444",
                    }}
                  >
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: "#e9eaec", fontWeight: "600" }}>{e.name}</Text>
                        <Text style={{ color: "#9aa4b2", fontSize: 14 }}>{e.email}</Text>
                        {e.phone && <Text style={{ color: "#9aa4b2", fontSize: 14 }}>{e.phone}</Text>}
                      </View>
                      <View style={{ flexDirection: "row", gap: 8 }}>
                        <Pressable
                          onPress={() => handleEditEmployee(e)}
                          style={{
                            paddingHorizontal: 12,
                            paddingVertical: 6,
                            borderRadius: 6,
                            backgroundColor: "#2563eb",
                          }}
                        >
                          <Text style={{ color: "white", fontWeight: "700", fontSize: 12 }}>Edit</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => handleDeleteEmployee(e.employee_id, e.name)}
                          style={{
                            paddingHorizontal: 12,
                            paddingVertical: 6,
                            borderRadius: 6,
                            backgroundColor: "#ef4444",
                          }}
                        >
                          <Text style={{ color: "white", fontWeight: "700", fontSize: 12 }}>Delete</Text>
                        </Pressable>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>
      )}

      {/* Add Company Modal */}
      <Modal visible={showAddCompany} transparent animationType="slide" onRequestClose={() => setShowAddCompany(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.8)", justifyContent: "center", padding: 20 }}>
          <View style={{ backgroundColor: "#1a1a1a", borderRadius: 16, padding: 20 }}>
            <Text style={{ fontSize: 24, fontWeight: "700", color: "#e9eaec", marginBottom: 16 }}>Add Company</Text>

            <Text style={{ color: "#e9eaec", marginBottom: 6 }}>Company Name</Text>
            <TextInput
              value={newCompanyName}
              onChangeText={setNewCompanyName}
              placeholder="Enter company name"
              placeholderTextColor="#888"
              style={{
                padding: 12,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: "#444",
                backgroundColor: "#0b0f14",
                color: "#e9eaec",
                marginBottom: 16,
              }}
            />

            <Text style={{ color: "#e9eaec", marginBottom: 6 }}>Timezone</Text>
            <TextInput
              value={newCompanyTimezone}
              onChangeText={setNewCompanyTimezone}
              placeholder="America/New_York"
              placeholderTextColor="#888"
              style={{
                padding: 12,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: "#444",
                backgroundColor: "#0b0f14",
                color: "#e9eaec",
                marginBottom: 20,
              }}
            />

            <View style={{ flexDirection: "row", gap: 12 }}>
              <Pressable
                onPress={() => setShowAddCompany(false)}
                style={{
                  flex: 1,
                  padding: 12,
                  borderRadius: 10,
                  backgroundColor: "#444",
                }}
              >
                <Text style={{ color: "#e9eaec", fontWeight: "700", textAlign: "center" }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleAddCompany}
                disabled={loading}
                style={{
                  flex: 1,
                  padding: 12,
                  borderRadius: 10,
                  backgroundColor: "#2563eb",
                  opacity: loading ? 0.5 : 1,
                }}
              >
                <Text style={{ color: "white", fontWeight: "700", textAlign: "center" }}>Create</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add Manager Modal */}
      <Modal visible={showAddManager} transparent animationType="slide" onRequestClose={() => setShowAddManager(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.8)", justifyContent: "center", padding: 20 }}>
          <View style={{ backgroundColor: "#1a1a1a", borderRadius: 16, padding: 20 }}>
            <Text style={{ fontSize: 24, fontWeight: "700", color: "#e9eaec", marginBottom: 16 }}>Add Manager</Text>

            <Text style={{ color: "#e9eaec", marginBottom: 6 }}>Name</Text>
            <TextInput
              value={newManagerName}
              onChangeText={setNewManagerName}
              placeholder="Enter manager name"
              placeholderTextColor="#888"
              style={{
                padding: 12,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: "#444",
                backgroundColor: "#0b0f14",
                color: "#e9eaec",
                marginBottom: 16,
              }}
            />

            <Text style={{ color: "#e9eaec", marginBottom: 6 }}>Email</Text>
            <TextInput
              value={newManagerEmail}
              onChangeText={setNewManagerEmail}
              placeholder="manager@example.com"
              placeholderTextColor="#888"
              autoCapitalize="none"
              keyboardType="email-address"
              style={{
                padding: 12,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: "#444",
                backgroundColor: "#0b0f14",
                color: "#e9eaec",
                marginBottom: 16,
              }}
            />

            <Text style={{ color: "#e9eaec", marginBottom: 6 }}>Password</Text>
            <TextInput
              value={newManagerPassword}
              onChangeText={setNewManagerPassword}
              placeholder="Enter password"
              placeholderTextColor="#888"
              secureTextEntry
              style={{
                padding: 12,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: "#444",
                backgroundColor: "#0b0f14",
                color: "#e9eaec",
                marginBottom: 20,
              }}
            />

            <View style={{ flexDirection: "row", gap: 12 }}>
              <Pressable
                onPress={() => setShowAddManager(false)}
                style={{
                  flex: 1,
                  padding: 12,
                  borderRadius: 10,
                  backgroundColor: "#444",
                }}
              >
                <Text style={{ color: "#e9eaec", fontWeight: "700", textAlign: "center" }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleAddManager}
                disabled={loading}
                style={{
                  flex: 1,
                  padding: 12,
                  borderRadius: 10,
                  backgroundColor: "#2563eb",
                  opacity: loading ? 0.5 : 1,
                }}
              >
                <Text style={{ color: "white", fontWeight: "700", textAlign: "center" }}>Create</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add Employee Modal */}
      <Modal visible={showAddEmployee} transparent animationType="slide" onRequestClose={() => setShowAddEmployee(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.8)", justifyContent: "center", padding: 20 }}>
          <View style={{ backgroundColor: "#1a1a1a", borderRadius: 16, padding: 20 }}>
            <Text style={{ fontSize: 24, fontWeight: "700", color: "#e9eaec", marginBottom: 16 }}>Add Employee</Text>

            <Text style={{ color: "#e9eaec", marginBottom: 6 }}>Name</Text>
            <TextInput
              value={newEmployeeName}
              onChangeText={setNewEmployeeName}
              placeholder="Enter employee name"
              placeholderTextColor="#888"
              style={{
                padding: 12,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: "#444",
                backgroundColor: "#0b0f14",
                color: "#e9eaec",
                marginBottom: 16,
              }}
            />

            <Text style={{ color: "#e9eaec", marginBottom: 6 }}>Email</Text>
            <TextInput
              value={newEmployeeEmail}
              onChangeText={setNewEmployeeEmail}
              placeholder="employee@example.com"
              placeholderTextColor="#888"
              autoCapitalize="none"
              keyboardType="email-address"
              style={{
                padding: 12,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: "#444",
                backgroundColor: "#0b0f14",
                color: "#e9eaec",
                marginBottom: 16,
              }}
            />

            <Text style={{ color: "#e9eaec", marginBottom: 6 }}>Phone (optional)</Text>
            <TextInput
              value={newEmployeePhone}
              onChangeText={setNewEmployeePhone}
              placeholder="Enter phone number"
              placeholderTextColor="#888"
              keyboardType="phone-pad"
              style={{
                padding: 12,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: "#444",
                backgroundColor: "#0b0f14",
                color: "#e9eaec",
                marginBottom: 20,
              }}
            />

            <View style={{ flexDirection: "row", gap: 12 }}>
              <Pressable
                onPress={() => setShowAddEmployee(false)}
                style={{
                  flex: 1,
                  padding: 12,
                  borderRadius: 10,
                  backgroundColor: "#444",
                }}
              >
                <Text style={{ color: "#e9eaec", fontWeight: "700", textAlign: "center" }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleAddEmployee}
                disabled={loading}
                style={{
                  flex: 1,
                  padding: 12,
                  borderRadius: 10,
                  backgroundColor: "#2563eb",
                  opacity: loading ? 0.5 : 1,
                }}
              >
                <Text style={{ color: "white", fontWeight: "700", textAlign: "center" }}>Create</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Employee Modal */}
      <Modal visible={showEditEmployee} transparent animationType="slide" onRequestClose={() => setShowEditEmployee(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.8)", justifyContent: "center", padding: 20 }}>
          <View style={{ backgroundColor: "#1a1a1a", borderRadius: 16, padding: 20 }}>
            <Text style={{ fontSize: 24, fontWeight: "700", color: "#e9eaec", marginBottom: 16 }}>Edit Employee</Text>

            <Text style={{ color: "#e9eaec", marginBottom: 6 }}>Name</Text>
            <TextInput
              value={editEmployeeName}
              onChangeText={setEditEmployeeName}
              placeholder="Enter employee name"
              placeholderTextColor="#888"
              style={{
                padding: 12,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: "#444",
                backgroundColor: "#0b0f14",
                color: "#e9eaec",
                marginBottom: 16,
              }}
            />

            <Text style={{ color: "#e9eaec", marginBottom: 6 }}>Email</Text>
            <TextInput
              value={editEmployeeEmail}
              onChangeText={setEditEmployeeEmail}
              placeholder="employee@example.com"
              placeholderTextColor="#888"
              autoCapitalize="none"
              keyboardType="email-address"
              style={{
                padding: 12,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: "#444",
                backgroundColor: "#0b0f14",
                color: "#e9eaec",
                marginBottom: 16,
              }}
            />

            <Text style={{ color: "#e9eaec", marginBottom: 6 }}>Phone (optional)</Text>
            <TextInput
              value={editEmployeePhone}
              onChangeText={setEditEmployeePhone}
              placeholder="Enter phone number"
              placeholderTextColor="#888"
              keyboardType="phone-pad"
              style={{
                padding: 12,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: "#444",
                backgroundColor: "#0b0f14",
                color: "#e9eaec",
                marginBottom: 16,
              }}
            />

            <Text style={{ color: "#e9eaec", marginBottom: 6 }}>Hire Date (optional)</Text>
            <TextInput
              value={editEmployeeHireDate}
              onChangeText={setEditEmployeeHireDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#888"
              style={{
                padding: 12,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: "#444",
                backgroundColor: "#0b0f14",
                color: "#e9eaec",
                marginBottom: 20,
              }}
            />

            <View style={{ flexDirection: "row", gap: 12 }}>
              <Pressable
                onPress={() => {
                  setShowEditEmployee(false);
                  setEditingEmployee(null);
                }}
                style={{
                  flex: 1,
                  padding: 12,
                  borderRadius: 10,
                  backgroundColor: "#444",
                }}
              >
                <Text style={{ color: "#e9eaec", fontWeight: "700", textAlign: "center" }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleUpdateEmployee}
                disabled={loading}
                style={{
                  flex: 1,
                  padding: 12,
                  borderRadius: 10,
                  backgroundColor: "#2563eb",
                  opacity: loading ? 0.5 : 1,
                }}
              >
                <Text style={{ color: "white", fontWeight: "700", textAlign: "center" }}>Update</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}


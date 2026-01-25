import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000";

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

async function apiGet<T>(path: string): Promise<T> {
  const token = localStorage.getItem("auth_token");
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ detail: "Request failed" }));
    throw new Error(data.detail || "Request failed");
  }
  return res.json();
}

async function apiPost<T>(path: string, body: any): Promise<T> {
  const token = localStorage.getItem("auth_token");
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ detail: "Request failed" }));
    throw new Error(data.detail || "Request failed");
  }
  return res.json();
}

export default function SystemAdminDashboard() {
  const navigate = useNavigate();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Form states
  const [showAddCompany, setShowAddCompany] = useState(false);
  const [showAddManager, setShowAddManager] = useState(false);
  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState("");
  const [newCompanyTimezone, setNewCompanyTimezone] = useState("America/New_York");
  const [newManagerName, setNewManagerName] = useState("");
  const [newManagerEmail, setNewManagerEmail] = useState("");
  const [newManagerPassword, setNewManagerPassword] = useState("");
  const [newEmployeeName, setNewEmployeeName] = useState("");
  const [newEmployeeEmail, setNewEmployeeEmail] = useState("");
  const [newEmployeePhone, setNewEmployeePhone] = useState("");

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

  function checkAuth() {
    const token = localStorage.getItem("auth_token");
    const role = localStorage.getItem("user_role");
    if (!token || role !== "system_admin") {
      navigate("/system-admin/login");
      return;
    }
  }

  async function loadCompanies() {
    setLoading(true);
    setError("");
    try {
      const data = await apiGet<Company[]>("/system-admin/companies");
      setCompanies(data);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load companies");
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
      alert(`Error: ${e?.message ?? "Failed to load managers"}`);
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
      alert(`Error: ${e?.message ?? "Failed to load employees"}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddCompany() {
    if (!newCompanyName.trim()) {
      alert("Please enter a company name");
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
      alert("Company created successfully");
    } catch (e: any) {
      alert(`Error: ${e?.message ?? "Failed to create company"}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddManager() {
    if (!selectedCompany) return;
    if (!newManagerName.trim() || !newManagerEmail.trim() || !newManagerPassword.trim()) {
      alert("Please fill in all fields");
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
      alert("Manager created successfully");
    } catch (e: any) {
      alert(`Error: ${e?.message ?? "Failed to create manager"}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddEmployee() {
    if (!selectedCompany) return;
    if (!newEmployeeName.trim() || !newEmployeeEmail.trim()) {
      alert("Please fill in name and email");
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
      alert("Employee created successfully");
    } catch (e: any) {
      alert(`Error: ${e?.message ?? "Failed to create employee"}`);
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    if (window.confirm("Are you sure you want to logout?")) {
      localStorage.removeItem("auth_token");
      localStorage.removeItem("user_role");
      localStorage.removeItem("user_id");
      localStorage.removeItem("user_name");
      navigate("/system-admin/login");
    }
  }

  const styles: Record<string, React.CSSProperties> = {
    page: {
      minHeight: "100vh",
      backgroundColor: "#0b0f14",
      padding: 20,
    },
    container: {
      maxWidth: "1400px",
      margin: "0 auto",
      width: "100%",
    },
    header: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 20,
    },
    title: {
      fontSize: 34,
      fontWeight: "800",
      color: "#e9eaec",
    },
    button: {
      padding: "10px 16px",
      borderRadius: 8,
      backgroundColor: "#444",
      color: "#e9eaec",
      fontWeight: "700",
      border: "none",
      cursor: "pointer",
    },
    section: {
      marginBottom: 32,
    },
    sectionHeader: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 12,
    },
    sectionTitle: {
      fontSize: 24,
      fontWeight: "700",
      color: "#e9eaec",
    },
    addButton: {
      padding: "8px 16px",
      borderRadius: 8,
      backgroundColor: "#2563eb",
      color: "white",
      fontWeight: "700",
      border: "none",
      cursor: "pointer",
    },
    companyCard: {
      padding: 16,
      borderRadius: 10,
      border: "1px solid",
      borderColor: "#444",
      backgroundColor: "#1a1a1a",
      cursor: "pointer",
      marginBottom: 10,
    },
    companyCardSelected: {
      borderColor: "#2563eb",
      backgroundColor: "#1e3a8a",
    },
    companyName: {
      color: "#e9eaec",
      fontWeight: "700",
      fontSize: 18,
      marginBottom: 4,
    },
    companyTimezone: {
      color: "#9aa4b2",
      fontSize: 14,
    },
    itemCard: {
      padding: 12,
      borderRadius: 8,
      backgroundColor: "#1a1a1a",
      border: "1px solid #444",
      marginBottom: 8,
    },
    itemName: {
      color: "#e9eaec",
      fontWeight: "600",
      marginBottom: 4,
    },
    itemEmail: {
      color: "#9aa4b2",
      fontSize: 14,
    },
    modal: {
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "rgba(0,0,0,0.8)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 1000,
    },
    modalContent: {
      backgroundColor: "#1a1a1a",
      borderRadius: 16,
      padding: 20,
      width: "100%",
      maxWidth: 500,
    },
    modalTitle: {
      fontSize: 24,
      fontWeight: "700",
      color: "#e9eaec",
      marginBottom: 16,
    },
    label: {
      color: "#e9eaec",
      marginBottom: 6,
      fontSize: 14,
    },
    input: {
      width: "100%",
      padding: 12,
      borderRadius: 10,
      border: "1px solid #444",
      backgroundColor: "#0b0f14",
      color: "#e9eaec",
      fontSize: 16,
      marginBottom: 16,
      boxSizing: "border-box",
    },
    modalButtons: {
      display: "flex",
      flexDirection: "row",
      gap: 12,
    },
    cancelButton: {
      flex: 1,
      padding: 12,
      borderRadius: 10,
      backgroundColor: "#444",
      color: "#e9eaec",
      fontWeight: "700",
      border: "none",
      cursor: "pointer",
    },
    submitButton: {
      flex: 1,
      padding: 12,
      borderRadius: 10,
      backgroundColor: "#2563eb",
      color: "white",
      fontWeight: "700",
      border: "none",
      cursor: "pointer",
      opacity: loading ? 0.5 : 1,
    },
  };

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.header}>
          <div style={styles.title}>System Admin</div>
          <button onClick={handleLogout} style={styles.button}>
            Logout
          </button>
        </div>

        {error && <div style={{ color: "#ef4444", marginBottom: 12 }}>{error}</div>}

        {/* Companies Section */}
        <div style={styles.section}>
          <div style={styles.sectionHeader}>
            <div style={styles.sectionTitle}>Companies</div>
            <button onClick={() => setShowAddCompany(true)} style={styles.addButton}>
              + Add Company
            </button>
          </div>

          {companies.length === 0 ? (
            <div style={{ color: "#9aa4b2" }}>No companies yet.</div>
          ) : (
            <div>
              {companies.map((c) => (
                <div
                  key={c.company_id}
                  onClick={() => setSelectedCompany(c)}
                  style={{
                    ...styles.companyCard,
                    ...(selectedCompany?.company_id === c.company_id ? styles.companyCardSelected : {}),
                  }}
                >
                  <div style={styles.companyName}>{c.name}</div>
                  <div style={styles.companyTimezone}>{c.timezone}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Selected Company Details */}
        {selectedCompany && (
          <div style={styles.section}>
            <div style={styles.sectionTitle} style={{ marginBottom: 16 }}>
              {selectedCompany.name}
            </div>

            {/* Managers Section */}
            <div style={{ marginBottom: 24 }}>
              <div style={styles.sectionHeader}>
                <div style={styles.sectionTitle}>Managers</div>
                <button onClick={() => setShowAddManager(true)} style={styles.addButton}>
                  + Add Manager
                </button>
              </div>

              {managers.length === 0 ? (
                <div style={{ color: "#9aa4b2" }}>No managers yet.</div>
              ) : (
                <div>
                  {managers.map((m) => (
                    <div key={m.manager_id} style={styles.itemCard}>
                      <div style={styles.itemName}>{m.name}</div>
                      <div style={styles.itemEmail}>{m.email}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Employees Section */}
            <div>
              <div style={styles.sectionHeader}>
                <div style={styles.sectionTitle}>Employees</div>
                <button onClick={() => setShowAddEmployee(true)} style={styles.addButton}>
                  + Add Employee
                </button>
              </div>

              {employees.length === 0 ? (
                <div style={{ color: "#9aa4b2" }}>No employees yet.</div>
              ) : (
                <div>
                  {employees.map((e) => (
                    <div key={e.employee_id} style={styles.itemCard}>
                      <div style={styles.itemName}>{e.name}</div>
                      <div style={styles.itemEmail}>{e.email}</div>
                      {e.phone && <div style={styles.itemEmail}>{e.phone}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Add Company Modal */}
        {showAddCompany && (
          <div style={styles.modal} onClick={() => setShowAddCompany(false)}>
            <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
              <div style={styles.modalTitle}>Add Company</div>

              <div>
                <div style={styles.label}>Company Name</div>
                <input
                  type="text"
                  value={newCompanyName}
                  onChange={(e) => setNewCompanyName(e.target.value)}
                  placeholder="Enter company name"
                  style={styles.input}
                />
              </div>

              <div>
                <div style={styles.label}>Timezone</div>
                <input
                  type="text"
                  value={newCompanyTimezone}
                  onChange={(e) => setNewCompanyTimezone(e.target.value)}
                  placeholder="America/New_York"
                  style={styles.input}
                />
              </div>

              <div style={styles.modalButtons}>
                <button onClick={() => setShowAddCompany(false)} style={styles.cancelButton}>
                  Cancel
                </button>
                <button onClick={handleAddCompany} disabled={loading} style={styles.submitButton}>
                  Create
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add Manager Modal */}
        {showAddManager && (
          <div style={styles.modal} onClick={() => setShowAddManager(false)}>
            <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
              <div style={styles.modalTitle}>Add Manager</div>

              <div>
                <div style={styles.label}>Name</div>
                <input
                  type="text"
                  value={newManagerName}
                  onChange={(e) => setNewManagerName(e.target.value)}
                  placeholder="Enter manager name"
                  style={styles.input}
                />
              </div>

              <div>
                <div style={styles.label}>Email</div>
                <input
                  type="email"
                  value={newManagerEmail}
                  onChange={(e) => setNewManagerEmail(e.target.value)}
                  placeholder="manager@example.com"
                  style={styles.input}
                />
              </div>

              <div>
                <div style={styles.label}>Password</div>
                <input
                  type="password"
                  value={newManagerPassword}
                  onChange={(e) => setNewManagerPassword(e.target.value)}
                  placeholder="Enter password"
                  style={styles.input}
                />
              </div>

              <div style={styles.modalButtons}>
                <button onClick={() => setShowAddManager(false)} style={styles.cancelButton}>
                  Cancel
                </button>
                <button onClick={handleAddManager} disabled={loading} style={styles.submitButton}>
                  Create
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add Employee Modal */}
        {showAddEmployee && (
          <div style={styles.modal} onClick={() => setShowAddEmployee(false)}>
            <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
              <div style={styles.modalTitle}>Add Employee</div>

              <div>
                <div style={styles.label}>Name</div>
                <input
                  type="text"
                  value={newEmployeeName}
                  onChange={(e) => setNewEmployeeName(e.target.value)}
                  placeholder="Enter employee name"
                  style={styles.input}
                />
              </div>

              <div>
                <div style={styles.label}>Email</div>
                <input
                  type="email"
                  value={newEmployeeEmail}
                  onChange={(e) => setNewEmployeeEmail(e.target.value)}
                  placeholder="employee@example.com"
                  style={styles.input}
                />
              </div>

              <div>
                <div style={styles.label}>Phone (optional)</div>
                <input
                  type="tel"
                  value={newEmployeePhone}
                  onChange={(e) => setNewEmployeePhone(e.target.value)}
                  placeholder="Enter phone number"
                  style={styles.input}
                />
              </div>

              <div style={styles.modalButtons}>
                <button onClick={() => setShowAddEmployee(false)} style={styles.cancelButton}>
                  Cancel
                </button>
                <button onClick={handleAddEmployee} disabled={loading} style={styles.submitButton}>
                  Create
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


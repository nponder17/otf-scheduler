import { Routes, Route, Navigate } from "react-router-dom";
import ManagerSchedule from "./pages/ManagerSchedule";
import EmployeeForm from "./pages/EmployeeForm";
import AdminIndex from "./pages/AdminIndex";
import CompanyAdmin from "./pages/CompanyAdmin";
import AddEmployee from "./pages/AddEmployee";
import Login from "./pages/Login";
import EmployeeSchedule from "./pages/EmployeeSchedule";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/manager/schedule" element={<ManagerSchedule />} />

      {/* Employee form route */}
      <Route path="/form/:employeeId" element={<EmployeeForm />} />

      {/* Admin routes */}
      <Route path="/admin" element={<AdminIndex />} />
      <Route path="/admin/:companyId" element={<CompanyAdmin />} />
      <Route path="/admin/:companyId/add" element={<AddEmployee />} />

      {/* Employee routes */}
      <Route path="/login" element={<Login />} />
      <Route path="/employee/schedule" element={<EmployeeSchedule />} />

      <Route path="*" element={<div style={{ padding: 24 }}>Not found</div>} />
    </Routes>
  );
}
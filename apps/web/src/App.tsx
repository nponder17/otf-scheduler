import { Routes, Route, Navigate } from "react-router-dom";
import ManagerSchedule from "./pages/ManagerSchedule";
import EmployeeForm from "./pages/EmployeeForm";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/manager/schedule" replace />} />
      <Route path="/manager/schedule" element={<ManagerSchedule />} />

      {/* ✅ employee form route */}
      <Route path="/form/:employeeId" element={<EmployeeForm />} />

      <Route path="*" element={<div style={{ padding: 24 }}>Not found</div>} />
    </Routes>
  );
}
import React from "react";
import { useParams, Link } from "react-router-dom";

export default function EmployeeForm() {
  const { employeeId } = useParams();

  return (
    <div style={{ minHeight: "100vh", background: "#0b0c0e", color: "#e9eaec", padding: 24 }}>
      <h1 style={{ marginTop: 0 }}>Employee Availability Form</h1>

      <p style={{ opacity: 0.8 }}>
        Employee ID: <code>{employeeId}</code>
      </p>

      <p style={{ opacity: 0.8 }}>
        This confirms routing is working. Next step is wiring the actual availability form UI + API calls.
      </p>

      <Link to="/manager/schedule" style={{ color: "#bfffdc" }}>
        ← Back to Manager Schedule
      </Link>
    </div>
  );
}

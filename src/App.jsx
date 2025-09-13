// App.js
import React, { useState } from "react";
import {
  FaUserGraduate,
  FaChalkboardTeacher,
  FaUserShield,
  FaUserPlus,
} from "react-icons/fa";
import RegisterPage from "./components/RegisterPage";
import StudentLogin from "./components/StudentLogin";
import TeacherDashboard from "./components/TeacherDashboard";
import AdminPage from "./components/AdminPage";
import api from "./components/api"; // ✅ corrected path

export default function App() {
  const [role, setRole] = useState(null);

  const roles = [
    { label: "Student", value: "student", color: "#4CAF50", icon: <FaUserGraduate /> },
    { label: "Teacher", value: "teacher", color: "#2196F3", icon: <FaChalkboardTeacher /> },
    { label: "Admin", value: "admin", color: "#FF9800", icon: <FaUserShield /> },
    { label: "Register", value: "register", color: "#9C27B0", icon: <FaUserPlus /> },
  ];

  const buttonStyle = (color) => ({
    background: color,
    color: "#fff",
    border: "none",
    borderRadius: 12,
    cursor: "pointer",
    fontWeight: "bold",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    transition: "all 0.3s ease",
    flex: "1 1 150px",
    minWidth: 120,
    padding: "14px 22px",
    fontSize: "1rem",
    boxShadow: "0 5px 15px rgba(0,0,0,0.2)",
  });

  return (
    <div
      style={{
        minHeight: "100vh",
        padding: "5%",
        fontFamily: "Arial, sans-serif",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        background:
          "linear-gradient(-45deg, #ee7752, #e73c7e, #23a6d5, #23d5ab)",
        backgroundSize: "400% 400%",
        animation: "gradientBG 15s ease infinite",
        transition: "all 0.3s",
      }}
    >
      <h1
        style={{
          marginBottom: "2rem",
          fontSize: "2.2rem",
          color: "#fff",
          textShadow: "2px 2px 5px rgba(0,0,0,0.3)",
        }}
      >
        🎓 Face Attendance System
      </h1>

      {/* Role Selection Buttons */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: "15px",
          marginBottom: "2rem",
          width: "100%",
          maxWidth: 900,
        }}
      >
        {roles.map((r) => (
          <button
            key={r.value}
            onClick={() => setRole(r.value)}
            style={buttonStyle(r.color)}
            onMouseOver={(e) => (e.currentTarget.style.transform = "scale(1.05)")}
            onMouseOut={(e) => (e.currentTarget.style.transform = "scale(1)")}
          >
            {r.icon} <span>{r.label}</span>
          </button>
        ))}
      </div>

      {/* Main Section */}
      <div
        style={{
          width: "100%",
          maxWidth: 900,
          minHeight: "60vh",
          backgroundColor: "rgba(255,255,255,0.95)",
          padding: "25px",
          borderRadius: "20px",
          boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
          transition: "all 0.3s",
        }}
      >
        {role === "register" && <RegisterPage api={api} />}
        {role === "student" && <StudentLogin api={api} setRole={setRole} />}
        {role === "teacher" && <TeacherDashboard api={api} />}
        {role === "admin" && <AdminPage api={api} />}
        {!role && (
          <p style={{ color: "#666", fontSize: "1.1rem" }}>
            Select a role to continue.
          </p>
        )}
      </div>

      <style>
        {`
          @keyframes gradientBG {
            0% {background-position: 0% 50%;}
            50% {background-position: 100% 50%;}
            100% {background-position: 0% 50%;}
          }

          @media (max-width: 768px) {
            h1 { font-size: 1.8rem; }
            button span { font-size: 0.9rem; }
            div[style*="minHeight: 60vh"] { padding: 20px; }
          }

          @media (max-width: 480px) {
            button { flex: 1 1 100%; font-size: 0.9rem; padding: 12px; }
            h1 { font-size: 1.5rem; }
          }
        `}
      </style>
    </div>
  );
}

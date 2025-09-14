// frontend/src/components/TeacherDashboard.jsx
import React, { useState, useEffect, useRef } from "react";
import QRCode from "qrcode.react";
import api from "./api";

const TeacherDashboard = ({ teacherId, classId }) => {
  const [session, setSession] = useState(null);
  const [attendance, setAttendance] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const intervalRef = useRef(null);

  // Create a new session
  const createSession = async () => {
    try {
      setLoading(true);
      setError("");
      const res = await api.post("/teacher/createSession", {
        teacherId,
        classId,
        durationMinutes: 10,
      });
      if (res.data.success) {
        setSession(res.data.session);
        setAttendance([]);
      } else {
        setError(res.data.error || "Failed to create session");
      }
    } catch (err) {
      setError("Error creating session");
    } finally {
      setLoading(false);
    }
  };

  // Auto-refresh QR token every 20s
  useEffect(() => {
    if (!session || session.finalized) return;

    intervalRef.current = setInterval(async () => {
      try {
        const res = await api.get(`/teacher/getSession/${session.classId}`);
        if (res.data.success) {
          setSession(res.data.session);
        }
      } catch (err) {
        console.error("Error refreshing session:", err);
      }
    }, 20000);

    return () => clearInterval(intervalRef.current);
  }, [session]);

  // Fetch attendance records
  const fetchAttendance = async () => {
    if (!session) return;
    try {
      const res = await api.get(`/teacher/viewAttendance/${session.sessionId}`);
      if (res.data.success) {
        setAttendance(res.data.attendance);
      } else {
        setError("Failed to fetch attendance");
      }
    } catch (err) {
      setError("Error fetching attendance");
    }
  };

  // Finalize attendance
  const finalizeAttendance = async () => {
    if (!session) return;
    try {
      const res = await api.post("/teacher/finalizeAttendance", {
        sessionId: session.sessionId,
      });
      if (res.data.success) {
        alert("✅ Attendance finalized");
        setSession({ ...session, finalized: true });
      } else {
        alert("❌ Failed to finalize attendance");
      }
    } catch (err) {
      alert("Error finalizing attendance");
    }
  };

  return (
    <div className="p-6 bg-gray-100 min-h-screen">
      <h1 className="text-2xl font-bold mb-4">Teacher Dashboard</h1>

      {!session && (
        <button
          onClick={createSession}
          disabled={loading}
          className="bg-blue-500 text-white px-4 py-2 rounded"
        >
          {loading ? "Creating..." : "Create New Session"}
        </button>
      )}

      {error && <p className="text-red-500 mt-2">{error}</p>}

      {session && (
        <div className="mt-6 bg-white p-4 rounded shadow">
          <h2 className="text-xl font-semibold mb-2">Active Session</h2>
          <p>
            <strong>Session ID:</strong> {session.sessionId}
          </p>
          <p>
            <strong>Class:</strong> {session.classId}
          </p>
          <p>
            <strong>Valid Until:</strong> {new Date(session.validUntil).toLocaleString()}
          </p>
          <p>
            <strong>Status:</strong>{" "}
            {session.finalized ? (
              <span className="text-red-600">Finalized</span>
            ) : (
              <span className="text-green-600">Active</span>
            )}
          </p>

          {!session.finalized && (
            <>
              <div className="mt-4">
                <h3 className="font-medium">QR Code (refreshes every 20s):</h3>
                <QRCode value={session.qrToken} size={200} className="mt-2" />
              </div>

              <div className="mt-4 flex gap-4">
                <button
                  onClick={fetchAttendance}
                  className="bg-green-500 text-white px-4 py-2 rounded"
                >
                  View Attendance
                </button>
                <button
                  onClick={finalizeAttendance}
                  className="bg-red-500 text-white px-4 py-2 rounded"
                >
                  Finalize Attendance
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {attendance.length > 0 && (
        <div className="mt-6 bg-white p-4 rounded shadow">
          <h2 className="text-lg font-semibold mb-2">Attendance Records</h2>
          <table className="w-full border">
            <thead>
              <tr className="bg-gray-200">
                <th className="border px-2 py-1">Student ID</th>
                <th className="border px-2 py-1">Status</th>
                <th className="border px-2 py-1">Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {attendance.map((record) => (
                <tr key={`${record.userId}-${record.timestamp}`}>
                  <td className="border px-2 py-1">{record.userId}</td>
                  <td className="border px-2 py-1">{record.status}</td>
                  <td className="border px-2 py-1">
                    {new Date(record.timestamp).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default TeacherDashboard;

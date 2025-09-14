// frontend/src/components/TeacherDashboard.jsx
import React, { useState, useEffect, useRef } from "react";
import QRCode from "qrcode.react";
import api from "./api";

const TeacherDashboard = ({ teacherId, classId }) => {
  const [step, setStep] = useState("verify"); // verify → session
  const [status, setStatus] = useState("⏳ Starting face verification...");
  const [session, setSession] = useState(null);
  const [attendance, setAttendance] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const qrIntervalRef = useRef(null);
  const attendanceIntervalRef = useRef(null);

  // 1. Teacher face verification
  useEffect(() => {
    const verifyFace = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
        });
        const videoElem = document.createElement("video");
        videoElem.srcObject = stream;
        await videoElem.play();

        const canvas = document.createElement("canvas");
        canvas.width = 320;
        canvas.height = 240;
        canvas.getContext("2d").drawImage(videoElem, 0, 0, canvas.width, canvas.height);
        const imageBase64 = canvas.toDataURL("image/jpeg");

        const res = await api.post("/verifyFaceOnly", {
          userId: teacherId,
          imageBase64,
        });

        stream.getTracks().forEach((t) => t.stop());

        if (res.data.success) {
          setStatus("✅ Face verified! You can create sessions now.");
          setStep("session");
        } else {
          setStatus("❌ Face not recognized. Please retry login.");
        }
      } catch (err) {
        console.error("Teacher face verification error:", err);
        setStatus("⚠️ Error verifying face. Retrying...");
        setTimeout(verifyFace, 3000); // retry
      }
    };

    if (step === "verify") verifyFace();
  }, [step, teacherId]);

  // 2. Create a new session
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

  // 3. Auto-refresh QR token every 20s
  useEffect(() => {
    if (!session || session.finalized) return;

    if (qrIntervalRef.current) clearInterval(qrIntervalRef.current);

    qrIntervalRef.current = setInterval(async () => {
      try {
        const res = await api.get(`/teacher/getSession/${session.classId}`);
        if (res.data.success) {
          setSession(res.data.session);
        }
      } catch (err) {
        console.error("Error refreshing session:", err);
      }
    }, 20000);

    return () => clearInterval(qrIntervalRef.current);
  }, [session]);

  // 4. Fetch attendance records
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

  // 5. Auto-refresh attendance every 10s
  useEffect(() => {
    if (!session || session.finalized) return;

    if (attendanceIntervalRef.current) clearInterval(attendanceIntervalRef.current);

    fetchAttendance(); // run immediately once

    attendanceIntervalRef.current = setInterval(() => {
      fetchAttendance();
    }, 10000);

    return () => clearInterval(attendanceIntervalRef.current);
  }, [session]);

  // 6. Finalize attendance
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

      {/* Step 1: Face verification */}
      {step === "verify" && (
        <p className="text-blue-600 font-medium">{status}</p>
      )}

      {/* Step 2: Session management */}
      {step === "session" && (
        <>
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
              <p><strong>Session ID:</strong> {session.sessionId}</p>
              <p><strong>Class:</strong> {session.classId}</p>
              <p>
                <strong>Valid Until:</strong>{" "}
                {new Date(session.validUntil).toLocaleString()}
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
                    <QRCode
                      value={JSON.stringify({
                        sessionId: session.sessionId,
                        qrToken: session.qrToken,
                      })}
                      size={200}
                      className="mt-2"
                    />
                  </div>

                  <div className="mt-4 flex gap-4">
                    <button
                      onClick={fetchAttendance}
                      className="bg-green-500 text-white px-4 py-2 rounded"
                    >
                      Refresh Attendance Now
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
        </>
      )}
    </div>
  );
};

export default TeacherDashboard;

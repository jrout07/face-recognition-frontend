// frontend/src/components/TeacherDashboard.jsx
import React, { useState, useEffect, useRef } from "react";
import QRCode from "qrcode.react";
import api from "./api";

const TeacherDashboard = ({ teacherId, classId }) => {
  const [step, setStep] = useState("verify");
  const [status, setStatus] = useState("⏳ Starting face verification...");
  const [session, setSession] = useState(null);
  const [attendance, setAttendance] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [timeLeft, setTimeLeft] = useState(20);
  const attendanceIntervalRef = useRef(null);

  // -------------------- Face verification --------------------
  useEffect(() => {
    const verifyFace = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
        const videoElem = document.createElement("video");
        videoElem.srcObject = stream;
        await videoElem.play();

        const canvas = document.createElement("canvas");
        canvas.width = 320;
        canvas.height = 240;
        canvas.getContext("2d").drawImage(videoElem, 0, 0, canvas.width, canvas.height);
        const imageBase64 = canvas.toDataURL("image/jpeg");

        const res = await api.post("/verifyFaceOnly", { userId: teacherId, imageBase64 });

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
        setTimeout(verifyFace, 3000);
      }
    };

    if (step === "verify") verifyFace();
  }, [step, teacherId]);

  // -------------------- Create session --------------------
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

  // -------------------- Refresh QR --------------------
  const refreshQr = async () => {
    if (!session) return;
    try {
      // 🔑 Backend should issue a *new* qrToken here
      const res = await api.post(`/teacher/refreshQr/${session.sessionId}`);
      if (res.data.success) {
        setSession({ ...session, qrToken: res.data.qrToken });
      }
    } catch (err) {
      console.error("Error refreshing QR:", err);
    }
  };

  // -------------------- Countdown timer --------------------
  useEffect(() => {
    if (!session || session.finalized) return;

    setTimeLeft(20);
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          refreshQr();
          return 20;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [session]);

  // -------------------- Attendance --------------------
  const fetchAttendance = async () => {
    if (!session) return;
    try {
      const res = await api.get(`/teacher/viewAttendance/${session.sessionId}`);
      if (res.data.success) {
        setAttendance(res.data.attendance);
      }
    } catch (err) {
      console.error("Error fetching attendance:", err);
    }
  };

  useEffect(() => {
    if (!session || session.finalized) return;
    if (attendanceIntervalRef.current) clearInterval(attendanceIntervalRef.current);
    fetchAttendance();
    attendanceIntervalRef.current = setInterval(fetchAttendance, 10000);
    return () => clearInterval(attendanceIntervalRef.current);
  }, [session]);

  const finalizeAttendance = async () => {
    if (!session) return;
    try {
      const res = await api.post("/teacher/finalizeAttendance", { sessionId: session.sessionId });
      if (res.data.success) {
        alert("✅ Attendance finalized");
        setSession({ ...session, finalized: true });
      }
    } catch (err) {
      alert("Error finalizing attendance");
    }
  };

  return (
    <div className="p-6 bg-gray-100 min-h-screen">
      <h1 className="text-2xl font-bold mb-4">Teacher Dashboard</h1>

      {step === "verify" && <p>{status}</p>}

      {step === "session" && (
        <>
          {!session && (
            <button onClick={createSession} disabled={loading} className="bg-blue-500 text-white px-4 py-2 rounded">
              {loading ? "Creating..." : "Create New Session"}
            </button>
          )}

          {session && (
            <div className="mt-6 bg-white p-4 rounded shadow">
              <h2 className="text-xl font-semibold mb-2">Active Session</h2>
              <p><strong>Session ID:</strong> {session.sessionId}</p>
              <p><strong>Class:</strong> {session.classId}</p>
              <p><strong>Status:</strong> {session.finalized ? "Finalized" : "Active"}</p>

              {!session.finalized && (
                <>
                  <QRCode
                    value={JSON.stringify({ sessionId: session.sessionId, qrToken: session.qrToken })}
                    size={200}
                    className="mt-2"
                  />
                  {console.log("Teacher QR generated:", { sessionId: session.sessionId, qrToken: session.qrToken })}

                  <div className="w-full bg-gray-200 h-2 rounded mt-2">
                    <div className="bg-green-500 h-2 rounded" style={{ width: `${(timeLeft / 20) * 100}%` }} />
                  </div>
                  <p className="text-sm">Refreshing in {timeLeft}s</p>

                  <div className="mt-4 flex gap-4">
                    <button onClick={fetchAttendance} className="bg-green-500 text-white px-4 py-2 rounded">
                      Refresh Attendance
                    </button>
                    <button onClick={finalizeAttendance} className="bg-red-500 text-white px-4 py-2 rounded">
                      Finalize Attendance
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default TeacherDashboard;

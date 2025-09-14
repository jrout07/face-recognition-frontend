import React, { useState, useRef, useEffect } from "react";
import api from "./api"; // axios instance with baseURL

export default function TeacherDashboard() {
  const [form, setForm] = useState({ teacherId: "", password: "" });
  const [logged, setLogged] = useState(false);
  const [faceVerified, setFaceVerified] = useState(false);
  const [verificationMsg, setVerificationMsg] = useState("");
  const [classId, setClassId] = useState("CLS1");
  const [qrData, setQrData] = useState("");
  const [qrCountdown, setQrCountdown] = useState(0);
  const [students, setStudents] = useState([]);
  const [attendanceFinalized, setAttendanceFinalized] = useState(false);

  const videoRef = useRef(null); // visible teacher camera during verification
  const sessionRef = useRef(null);
  const qrPollRef = useRef(null);
  const countdownRef = useRef(null);
  const attendancePollRef = useRef(null);
  const faceIntervalRef = useRef(null);

  // helper: start camera and wait for metadata
  const startCamera = async (target = videoRef) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (!target.current) {
        // Stop tracks if no target (safety)
        stream.getTracks().forEach((t) => t.stop());
        return null;
      }
      target.current.srcObject = stream;
      await new Promise((resolve) => {
        if (target.current.readyState >= 2) return resolve();
        const onLoaded = () => {
          target.current.removeEventListener("loadedmetadata", onLoaded);
          resolve();
        };
        target.current.addEventListener("loadedmetadata", onLoaded);
      });
      target.current.play().catch(() => {});
      return stream;
    } catch (err) {
      console.error("startCamera error:", err);
      throw err;
    }
  };

  const stopCameraTracks = (target = videoRef) => {
    try {
      const stream = target.current?.srcObject;
      if (stream && stream.getTracks) {
        stream.getTracks().forEach((t) => t.stop());
      }
      if (target.current) target.current.srcObject = null;
    } catch (err) {
      console.warn("stopCameraTracks:", err);
    }
  };

  /* ---------------- Login ---------------- */
  const login = async () => {
    if (!form.teacherId || !form.password) return alert("Enter teacher ID & password");
    try {
      const res = await api.post("/login", { userId: form.teacherId, password: form.password });
      if (res.data.success && res.data.role === "teacher") {
        setLogged(true);
        await startCamera(videoRef); // start camera for face verify
      } else {
        alert(res.data.error || "Login failed");
      }
    } catch (err) {
      alert("Login error: " + (err?.response?.data?.error || err.message));
    }
  };

  /* ---------------- Auto Face Verify (interval) ---------------- */
  const runFaceVerificationLoop = () => {
    // clear previous
    if (faceIntervalRef.current) clearInterval(faceIntervalRef.current);

    faceIntervalRef.current = setInterval(async () => {
      if (!videoRef.current) return;
      const vw = videoRef.current.videoWidth;
      const vh = videoRef.current.videoHeight;
      if (!vw || !vh) return;

      const canvas = document.createElement("canvas");
      canvas.width = vw;
      canvas.height = vh;
      canvas.getContext("2d").drawImage(videoRef.current, 0, 0, vw, vh);
      const imageBase64 = canvas.toDataURL("image/jpeg");

      try {
        const res = await api.post("/verifyFaceOnly", { userId: form.teacherId, imageBase64 });
        if (res.data.success) {
          clearInterval(faceIntervalRef.current);
          setFaceVerified(true);
          setVerificationMsg("✅ Face verified!");
          stopCameraTracks(videoRef);
          await createSession();
        } else {
          setVerificationMsg("❌ Face not matched — retrying...");
        }
      } catch (err) {
        console.error("verifyFaceOnly error:", err);
        setVerificationMsg("⚠️ Error verifying face — retrying...");
      }
    }, 2500); // every 2.5s
  };

  /* ---------------- Session & QR ---------------- */
  const createSession = async () => {
    try {
      const res = await api.post("/teacher/createSession", { teacherId: form.teacherId, classId });
      if (res.data.success) {
        sessionRef.current = res.data.session;
        setQrData(JSON.stringify({ sessionId: res.data.session.sessionId, qrToken: res.data.session.qrToken }));
        startQrCountdown(20);
        startQrAutoRefresh(20);
        startAttendancePolling(res.data.session.sessionId);
      } else {
        console.error("createSession failed:", res.data);
      }
    } catch (err) {
      console.error("createSession error:", err);
    }
  };

  const startQrAutoRefresh = (periodSec = 20) => {
    clearInterval(qrPollRef.current);
    qrPollRef.current = setInterval(async () => {
      if (!sessionRef.current) return;
      try {
        const res = await api.get(`/teacher/getSession/${classId}`);
        if (res.data.success) {
          sessionRef.current.qrToken = res.data.session.qrToken;
          setQrData(JSON.stringify({ sessionId: sessionRef.current.sessionId, qrToken: res.data.session.qrToken }));
          setQrCountdown(periodSec);
        }
      } catch (err) {
        console.error("QR refresh error:", err);
      }
    }, periodSec * 1000);
  };

  const startQrCountdown = (durationInSeconds) => {
    clearInterval(countdownRef.current);
    setQrCountdown(durationInSeconds);
    countdownRef.current = setInterval(() => {
      setQrCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countdownRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  /* ---------------- Attendance Poll ---------------- */
  const startAttendancePolling = (sessionId) => {
    clearInterval(attendancePollRef.current);
    setStudents([]);
    attendancePollRef.current = setInterval(async () => {
      try {
        const res = await api.get(`/teacher/viewAttendance/${sessionId}`);
        if (res.data.success) {
          setStudents(res.data.attendance || []);
        }
      } catch (err) {
        console.error("attendance polling error:", err);
      }
    }, 3000);
  };

  /* ---------------- Finalize Attendance ---------------- */
  const finalizeAttendance = async () => {
    if (!sessionRef.current) return;
    try {
      const res = await api.post("/teacher/finalizeAttendance", { sessionId: sessionRef.current.sessionId });
      if (res.data.success) {
        alert("Attendance finalized!");
        setAttendanceFinalized(true);
        clearInterval(qrPollRef.current);
        clearInterval(countdownRef.current);
        clearInterval(attendancePollRef.current);
        // refresh final list once
        const r = await api.get(`/teacher/viewAttendance/${sessionRef.current.sessionId}`);
        if (r.data.success) setStudents(r.data.attendance || []);
      } else {
        alert(res.data.error || "Failed to finalize attendance");
      }
    } catch (err) {
      console.error("finalizeAttendance error:", err);
      alert("Error finalizing attendance: " + err.message);
    }
  };

  /* ---------------- Logout ---------------- */
  const handleLogout = () => {
    stopCameraTracks(videoRef);
    setLogged(false);
    setFaceVerified(false);
    setVerificationMsg("");
    setForm({ teacherId: "", password: "" });
    setQrData("");
    setQrCountdown(0);
    setStudents([]);
    setAttendanceFinalized(false);
    sessionRef.current = null;

    clearInterval(qrPollRef.current);
    clearInterval(attendancePollRef.current);
    clearInterval(countdownRef.current);
    if (faceIntervalRef.current) clearInterval(faceIntervalRef.current);
  };

  /* ---------------- Effects ---------------- */
  useEffect(() => {
    if (logged) {
      // start a verification loop after camera ready
      runFaceVerificationLoop();
    } else {
      if (faceIntervalRef.current) clearInterval(faceIntervalRef.current);
    }
    return () => {
      if (faceIntervalRef.current) clearInterval(faceIntervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logged]);

  /* ---------------- UI ---------------- */
  return (
    <div style={{ padding: 20, display: "flex", flexWrap: "wrap", gap: 50, justifyContent: "center" }}>
      <div style={{ minWidth: 300, maxWidth: 600, flex: 1 }}>
        <h3 style={{ textAlign: "center" }}>Teacher Dashboard</h3>

        {!logged && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input placeholder="Teacher ID" style={{ padding: 10 }} onChange={(e) => setForm({ ...form, teacherId: e.target.value })} />
            <input type="password" placeholder="Password" style={{ padding: 10 }} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            <button onClick={login} style={{ padding: 10, marginTop: 6 }}>Login</button>
          </div>
        )}

        {logged && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <button onClick={handleLogout} style={{ background: "#f44336", color: "#fff", padding: 8 }}>Logout</button>
              <div style={{ fontWeight: "bold" }}>{faceVerified ? "Verified" : "Not verified"}</div>
            </div>

            <div style={{ marginTop: 12, display: "flex", gap: 12, alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                {!faceVerified && (
                  <>
                    <video ref={videoRef} autoPlay playsInline style={{ width: "100%", maxWidth: 320, borderRadius: 8, background: "#000" }} />
                    <p style={{ fontWeight: 600 }}>{verificationMsg || "Please look at the camera..."}</p>
                  </>
                )}

                <input value={classId} onChange={(e) => setClassId(e.target.value)} placeholder="Class ID" style={{ padding: 8, width: "100%" }} />
              </div>

              {faceVerified && (
                <div style={{ textAlign: "center", minWidth: 300 }}>
                  {qrData && (
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(qrData)}&size=400x400`}
                      alt="Class QR"
                      style={{ maxWidth: 280, borderRadius: 8, opacity: qrCountdown === 0 ? 0.5 : 1 }}
                    />
                  )}
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 18, fontWeight: "700", color: qrCountdown > 0 ? "#27ae60" : "#e74c3c" }}>
                      {qrCountdown > 0 ? `QR refreshes in ${qrCountdown}s` : "Generating new QR..."}
                    </div>
                    <div style={{ height: 10, background: "#eee", borderRadius: 6, marginTop: 8 }}>
                      <div style={{ height: "100%", width: `${(qrCountdown / 20) * 100}%`, background: qrCountdown > 5 ? "#27ae60" : "#e74c3c", transition: "width 1s linear" }} />
                    </div>
                    <button onClick={finalizeAttendance} style={{ marginTop: 12, padding: "8px 12px", background: "#27ae60", color: "#fff" }}>
                      Finalize Attendance
                    </button>
                  </div>
                </div>
              )}
            </div>

            {students.length > 0 && (
              <div style={{ marginTop: 20 }}>
                {!attendanceFinalized && (
                  <>
                    <h4>🕒 Pending Students</h4>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {students.filter(s => !s.finalized).map((s) => (
                        <div key={s.userId} style={{ width: 160, padding: 10, border: "1px solid #ccc", borderRadius: 6 }}>
                          <div style={{ fontWeight: 700 }}>{s.userId}</div>
                          <div style={{ color: "#e67e22", marginTop: 6 }}>Pending</div>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                <h4 style={{ marginTop: 16 }}>✅ Finalized Attendance</h4>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {students.filter(s => s.finalized).map((s) => (
                    <div key={s.userId} style={{ width: 160, padding: 10, border: "1px solid #ccc", borderRadius: 6, background: "#d4edda" }}>
                      <div style={{ fontWeight: 700 }}>{s.userId}</div>
                      <div style={{ color: "green", marginTop: 6 }}>Finalized</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

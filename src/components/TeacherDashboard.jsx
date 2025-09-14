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

  const videoRef = useRef(null);
  const sessionRef = useRef(null);
  const qrPollRef = useRef(null);
  const countdownRef = useRef(null);
  const attendancePollRef = useRef(null);
  const faceVerifyTimeoutRef = useRef(null);

  /* ---------------- Camera ---------------- */
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      videoRef.current.srcObject = stream;
      videoRef.current.play();
    } catch (err) {
      console.error("Cannot access camera:", err.message);
    }
  };

  const stopCamera = () => {
    const stream = videoRef.current?.srcObject;
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
  };

  /* ---------------- Login ---------------- */
  const login = async () => {
    if (!form.teacherId || !form.password) return alert("Enter teacher ID & password");
    try {
      const res = await api.post("/login", {
        userId: form.teacherId,
        password: form.password,
      });

      if (res.data.success && res.data.role === "teacher") {
        setLogged(true);
        await startCamera();
      } else {
        alert(res.data.error || "Login failed");
      }
    } catch (err) {
      alert("Login error: " + (err?.response?.data?.error || err.message));
    }
  };

  /* ---------------- Auto Face Verify ---------------- */
  const autoFaceVerify = async () => {
    if (!videoRef.current || faceVerified) return;

    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    canvas.getContext("2d").drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    const imageBase64 = canvas.toDataURL("image/jpeg");

    try {
      const res = await api.post("/markAttendanceLive", {
        sessionId: "teacher-verification", // dummy session for teacher
        userId: form.teacherId,
        imageBase64,
      });

      if (res.data.success) {
        setFaceVerified(true);
        setVerificationMsg("✅ Face verified!");
        stopCamera();
        await createSession();
      } else {
        setVerificationMsg("❌ Face not matched. Retrying...");
        faceVerifyTimeoutRef.current = setTimeout(autoFaceVerify, 3000);
      }
    } catch (err) {
      setVerificationMsg("⚠️ Error verifying face. Retrying...");
      faceVerifyTimeoutRef.current = setTimeout(autoFaceVerify, 3000);
    }
  };

  /* ---------------- Session & QR ---------------- */
  const createSession = async () => {
    try {
      const res = await api.post("/teacher/createSession", {
        teacherId: form.teacherId,
        classId,
      });

      if (res.data.success) {
        sessionRef.current = res.data.session;
        setQrData(
          JSON.stringify({
            sessionId: res.data.session.sessionId,
            qrToken: res.data.session.qrToken,
          })
        );
        startQrCountdown(20);
        startQrAutoRefresh();
      }
    } catch (err) {
      console.error("Create session error:", err);
    }
  };

  /* ---------------- QR Auto Refresh ---------------- */
  const startQrAutoRefresh = () => {
    clearInterval(qrPollRef.current);
    qrPollRef.current = setInterval(async () => {
      if (!sessionRef.current) return;

      try {
        const res = await api.get(`/teacher/getSession/${classId}`);
        if (res.data.success) {
          sessionRef.current.qrToken = res.data.session.qrToken;
          setQrData(
            JSON.stringify({
              sessionId: sessionRef.current.sessionId,
              qrToken: res.data.session.qrToken,
            })
          );
          setQrCountdown(20);
        }
      } catch (err) {
        console.error("QR refresh error:", err);
      }
    }, 15000);
  };

  /* ---------------- QR Countdown ---------------- */
  const startQrCountdown = (durationInSeconds) => {
    clearInterval(countdownRef.current);
    setQrCountdown(durationInSeconds);

    countdownRef.current = setInterval(() => {
      setQrCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countdownRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  /* ---------------- Attendance Poll ---------------- */
  useEffect(() => {
    if (!faceVerified || !sessionRef.current) return;
    attendancePollRef.current = setInterval(async () => {
      try {
        const res = await api.get(`/teacher/viewAttendance/${sessionRef.current.sessionId}`);
        if (res.data.success) {
          setStudents(res.data.attendance || []);
        }
      } catch (err) {
        console.error(err);
      }
    }, 3000);

    return () => clearInterval(attendancePollRef.current);
  }, [faceVerified, classId]);

  /* ---------------- Finalize Attendance ---------------- */
  const finalizeAttendance = async () => {
    if (!sessionRef.current) return;
    try {
      const res = await api.post("/teacher/finalizeAttendance", {
        sessionId: sessionRef.current.sessionId,
      });
      if (res.data.success) {
        alert("Attendance finalized!");
        setAttendanceFinalized(true);
        clearInterval(qrPollRef.current);
        clearInterval(countdownRef.current);
      } else {
        alert(res.data.error || "Failed to finalize attendance");
      }
    } catch (err) {
      console.error(err);
      alert("Error finalizing attendance: " + err.message);
    }
  };

  /* ---------------- Logout ---------------- */
  const handleLogout = () => {
    stopCamera();
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
    clearTimeout(faceVerifyTimeoutRef.current);
  };

  useEffect(() => {
    if (logged) autoFaceVerify();
  }, [logged]);

  /* ---------------- UI ---------------- */
  return (
    <div style={{ padding: 20, display: "flex", flexWrap: "wrap", gap: 50, justifyContent: "center" }}>
      <div style={{ minWidth: 300, maxWidth: 350, flex: 1 }}>
        <h3 style={{ textAlign: "center" }}>Teacher Dashboard</h3>

        {!logged && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input
              style={{ padding: 10, borderRadius: 6, border: "1px solid #ccc" }}
              placeholder="Teacher ID"
              onChange={e => setForm({ ...form, teacherId: e.target.value })}
            />
            <input
              style={{ padding: 10, borderRadius: 6, border: "1px solid #ccc" }}
              type="password"
              placeholder="Password"
              onChange={e => setForm({ ...form, password: e.target.value })}
            />
            <button
              onClick={login}
              style={{
                padding: 10,
                borderRadius: 6,
                backgroundColor: "#3498db",
                color: "#fff",
                border: "none",
                cursor: "pointer",
              }}
            >
              Login
            </button>
          </div>
        )}

        {logged && (
          <>
            <button
              onClick={handleLogout}
              style={{
                marginBottom: 10,
                padding: "10px 15px",
                borderRadius: 6,
                backgroundColor: "#f44336",
                color: "#fff",
              }}
            >
              Logout
            </button>

            <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 15, alignItems: "center" }}>
              {!faceVerified && (
                <>
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    style={{
                      width: "100%",
                      maxWidth: 320,
                      border: "2px solid #ccc",
                      borderRadius: 12,
                      backgroundColor: "#000",
                    }}
                  />
                  <p style={{ color: "#555", fontWeight: "bold" }}>
                    {verificationMsg || "🙂 Please look at the camera to verify"}
                  </p>
                </>
              )}

              <input
                style={{ padding: 10, borderRadius: 6, border: "1px solid #ccc", width: "100%", textAlign: "center" }}
                placeholder="Class ID"
                value={classId}
                onChange={e => setClassId(e.target.value)}
              />

              {faceVerified && !attendanceFinalized && (
                <div style={{ textAlign: "center" }}>
                  {qrData && (
                    <div style={{ position: "relative", display: "inline-block" }}>
                      <img
                        style={{
                          margin: "10px 0",
                          borderRadius: 8,
                          width: "100%",
                          maxWidth: "400px",
                          opacity: qrCountdown === 0 ? 0.4 : 1,
                        }}
                        src={`https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(qrData)}&size=400x400`}
                        alt="Class QR"
                      />

                      {qrCountdown === 0 && (
                        <div
                          style={{
                            position: "absolute",
                            top: "50%",
                            left: "50%",
                            transform: "translate(-50%, -50%)",
                            background: "rgba(231, 76, 60, 0.85)",
                            color: "#fff",
                            padding: "12px 20px",
                            borderRadius: "8px",
                            fontWeight: "bold",
                            fontSize: "18px",
                          }}
                        >
                          ⚠️ QR Expired — New one coming...
                        </div>
                      )}
                    </div>
                  )}

                  <p
                    style={{
                      fontSize: "20px",
                      fontWeight: "bold",
                      color: qrCountdown <= 5 && qrCountdown > 0 ? "#e74c3c" : "#27ae60",
                      marginTop: 10,
                    }}
                  >
                    {qrCountdown > 0 ? `QR refreshes in: ${qrCountdown}s` : "Generating new QR..."}
                  </p>

                  <div
                    style={{
                      width: "100%",
                      maxWidth: "400px",
                      height: "12px",
                      backgroundColor: "#ddd",
                      borderRadius: "6px",
                      overflow: "hidden",
                      marginTop: "8px",
                      marginBottom: "12px",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${(qrCountdown / 20) * 100}%`,
                        backgroundColor: qrCountdown <= 5 && qrCountdown > 0 ? "#e74c3c" : "#27ae60",
                        transition: "width 1s linear",
                      }}
                    />
                  </div>

                  <button
                    onClick={finalizeAttendance}
                    style={{
                      marginTop: 15,
                      padding: "10px 16px",
                      borderRadius: 6,
                      backgroundColor: "#27ae60",
                      color: "#fff",
                      fontSize: "16px",
                      fontWeight: "bold",
                      cursor: "pointer",
                    }}
                  >
                    Finalize Attendance
                  </button>
                </div>
              )}
            </div>

            {students.length > 0 && (
              <div style={{ marginTop: 30 }}>
                <h4 style={{ textAlign: "center" }}>Scanned Students</h4>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
                  {students.map(s => (
                    <div
                      key={s.userId}
                      style={{
                        border: "1px solid #000",
                        padding: 10,
                        borderRadius: 6,
                        width: "45%",
                        textAlign: "center",
                        backgroundColor: s.status === "present" ? "#d4edda" : "#fff",
                      }}
                    >
                      <p>{s.userId}</p>
                      <p>{s.status}</p>
                      {s.finalized ? (
                        <p style={{ color: "green", fontWeight: "bold" }}>✅ Finalized</p>
                      ) : (
                        <p style={{ color: "#e67e22", fontWeight: "bold" }}>🕒 Pending</p>
                      )}
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

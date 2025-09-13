import React, { useState, useRef, useEffect } from "react";
import axios from "axios";

export default function TeacherDashboard() {
  const [form, setForm] = useState({ teacherId: "", password: "" });
  const [logged, setLogged] = useState(false);
  const [faceVerified, setFaceVerified] = useState(false);
  const [verificationFailed, setVerificationFailed] = useState(false);
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
    if (stream) stream.getTracks().forEach(track => track.stop());
    videoRef.current.srcObject = null;
  };

  /* ---------------- Login ---------------- */
  const login = async () => {
    if (!form.teacherId || !form.password) return alert("Enter teacher ID & password");
    try {
      const res = await axios.post(`${import.meta.env.VITE_API_BASE_URL}/login`, {
        userId: form.teacherId,
        password: form.password,
      });

      if (res.data.success && res.data.role === "teacher") {
        setLogged(true);
        await startCamera();
      } else alert(res.data.error || "Login failed");
    } catch (err) {
      alert("Login error: " + (err?.response?.data?.error || err.message));
    }
  };

  /* ---------------- Face Verify ---------------- */
  const autoFaceVerify = async () => {
    if (!videoRef.current || faceVerified || verificationFailed) return;

    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    canvas.getContext("2d").drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    const imageBase64 = canvas.toDataURL("image/jpeg");

    try {
      const res = await axios.post(`${import.meta.env.VITE_API_BASE_URL}/markAttendanceLive`, {
        userId: form.teacherId,
        imageBase64,
      });

      if (res.data.success) {
        setFaceVerified(true);
        stopCamera();
        fetchStudents();
        await createSession();
      } else {
        setVerificationFailed(true);
        faceVerifyTimeoutRef.current = setTimeout(autoFaceVerify, 3000);
      }
    } catch (err) {
      setVerificationFailed(true);
      faceVerifyTimeoutRef.current = setTimeout(autoFaceVerify, 3000);
    }
  };

  /* ---------------- Students ---------------- */
  const fetchStudents = async () => {
    try {
      const res = await axios.get(`${import.meta.env.VITE_API_BASE_URL}/teacher/class-students/${classId}`);
      if (res.data.success) {
        setStudents(res.data.students.map(s => ({ ...s, attended: false })));
      }
    } catch (err) {
      console.error(err);
    }
  };

  /* ---------------- Session & QR ---------------- */
  const createSession = async () => {
    try {
      const res = await axios.post(`${import.meta.env.VITE_API_BASE_URL}/teacher/createSession`, {
        teacherId: form.teacherId,
        classId,
      });

      if (res.data.success) {
        sessionRef.current = res.data.session;
        setQrData(JSON.stringify({ sessionId: res.data.session.sessionId, qrToken: res.data.session.qrToken }));
        startQrCountdown(600); // 10 minutes countdown
        startQrAutoRefresh(); // refresh QR every 10s
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
        const res = await axios.post(`${import.meta.env.VITE_API_BASE_URL}/teacher/refreshQr`, {
          sessionId: sessionRef.current.sessionId,
        });

        if (res.data.success) {
          sessionRef.current.qrToken = res.data.qrToken;
          setQrData(JSON.stringify({ sessionId: sessionRef.current.sessionId, qrToken: res.data.qrToken }));
        }
      } catch (err) {
        console.error("QR refresh error:", err);
      }
    }, 10000); // every 10 seconds
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
    if (!faceVerified) return;
    attendancePollRef.current = setInterval(async () => {
      try {
        const res = await axios.get(`${import.meta.env.VITE_API_BASE_URL}/teacher/scanned-students/${classId}`);
        if (res.data.success) {
          setStudents(prev =>
            prev.map(s => ({
              ...s,
              attended: res.data.students.some(st => st.userId === s.userId),
            }))
          );
        }
      } catch (err) {
        console.error(err);
      }
    }, 3000);

    return () => clearInterval(attendancePollRef.current);
  }, [faceVerified, classId]);

  /* ---------------- Submit Attendance ---------------- */
  const submitAttendance = async () => {
    if (!sessionRef.current) return;
    try {
      const res = await axios.post(`${import.meta.env.VITE_API_BASE_URL}/teacher/submitAttendance`, {
        sessionId: sessionRef.current.sessionId,
      });
      if (res.data.success) {
        alert("Attendance finalized!");
        setAttendanceFinalized(true);
        clearInterval(qrPollRef.current);
        clearInterval(countdownRef.current);
      } else {
        alert(res.data.error || "Failed to submit attendance");
      }
    } catch (err) {
      console.error(err);
      alert("Error submitting attendance: " + err.message);
    }
  };

  /* ---------------- Logout ---------------- */
  const handleLogout = () => {
    stopCamera();
    setLogged(false);
    setFaceVerified(false);
    setVerificationFailed(false);
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
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  style={{
                    width: "100%",
                    maxWidth: 320,
                    border: verificationFailed ? "4px solid #e74c3c" : "1px solid #ccc",
                    borderRadius: 12,
                    backgroundColor: "#000",
                  }}
                />
              )}

              <input
                style={{ padding: 10, borderRadius: 6, border: "1px solid #ccc", width: "100%", textAlign: "center" }}
                placeholder="Class ID"
                value={classId}
                onChange={e => setClassId(e.target.value)}
              />

              {faceVerified && qrData && !attendanceFinalized && (
                <div style={{ textAlign: "center" }}>
                  <img
                    style={{ margin: "10px 0", borderRadius: 8 }}
                    src={`https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(qrData)}&size=150x150`}
                    alt="Class QR"
                  />
                  <p>QR refreshes in: <strong>{qrCountdown}s</strong></p>
                  <button onClick={submitAttendance} style={{ marginTop: 10, padding: "8px 12px", borderRadius: 6, backgroundColor: "#27ae60", color: "#fff" }}>
                    Finalize Attendance
                  </button>
                </div>
              )}

              {!faceVerified && verificationFailed && <p style={{ color: "#e74c3c", fontWeight: "bold" }}>Face not matched! Try again.</p>}
              {!faceVerified && !verificationFailed && <p style={{ color: "#555" }}>Verifying face...</p>}
            </div>

            {students.length > 0 && (
              <div style={{ marginTop: 30 }}>
                <h4 style={{ textAlign: "center" }}>Registered Students</h4>
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
                        backgroundColor: s.attended ? "#d4edda" : "#fff",
                      }}
                    >
                      <p>{s.name}</p>
                      <p>{s.userId}</p>
                      {s.attended && <p style={{ color: "green", fontWeight: "bold" }}>✅ Attendance</p>}
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

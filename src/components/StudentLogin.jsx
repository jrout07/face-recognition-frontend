import React, { useRef, useState, useEffect } from "react";
import QrScanner from "react-qr-scanner"; // compatible for browser
import api from "./api"; // axios instance with baseURL

export default function StudentLogin() {
  const [form, setForm] = useState({ userId: "", password: "" });
  const [loggedUser, setLoggedUser] = useState(null);
  const [step, setStep] = useState("login"); // login -> face -> qr
  const [status, setStatus] = useState("");
  const [faceBorderColor, setFaceBorderColor] = useState("gray");
  const [qrBorderColor, setQrBorderColor] = useState("gray");
  const [cameraFacingMode, setCameraFacingMode] = useState("user");
  const [qrKey, setQrKey] = useState(0);

  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const isMobile = /Mobi|Android/i.test(navigator.userAgent);

  // ---------------- Camera ----------------
  const startCamera = async () => {
    if (!videoRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: cameraFacingMode },
      });
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      videoRef.current.play();
    } catch (err) {
      alert("Cannot access camera: " + err.message);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  useEffect(() => {
    if (step === "face" || step === "qr") startCamera();
    return () => stopCamera();
  }, [step, cameraFacingMode]);

  // ---------------- Login ----------------
  const handleLogin = async () => {
    if (!form.userId || !form.password) return alert("Enter userId and password");
    try {
      const res = await api.post("/login", form);
      if (res.data.success && res.data.role === "student") {
        setLoggedUser(res.data);
        setStep("face");
        setFaceBorderColor("gray");
        setStatus("Initializing camera...");
      } else {
        alert(res.data.error || "Login failed");
      }
    } catch (err) {
      alert("Login error: " + (err.response?.data?.error || err.message));
    }
  };

  // ---------------- Face Verification ----------------
  useEffect(() => {
    if (step !== "face") return;
    let retryTimeout;

    const verifyFace = async () => {
      if (!videoRef.current || !videoRef.current.videoWidth || !videoRef.current.videoHeight) {
        setStatus("❌ Video not ready, retrying...");
        retryTimeout = setTimeout(verifyFace, 1500);
        return;
      }

      const canvas = document.createElement("canvas");
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      canvas.getContext("2d").drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const imageBase64 = canvas.toDataURL("image/jpeg").split(",")[1];

      try {
        const res = await api.post("/markAttendanceLive", {
          userId: loggedUser.userId,
          imageBase64,
        });

        if (res.data.success) {
          setStatus("✅ Face verified! Moving to QR scan...");
          setFaceBorderColor("limegreen");
          stopCamera();
          setTimeout(() => {
            setStep("qr");
            setCameraFacingMode(isMobile ? "environment" : "user"); // back camera for mobile
            setQrKey((prev) => prev + 1);
          }, 1000);
        } else {
          setStatus("❌ Face not matched, retrying...");
          setFaceBorderColor("red");
          setTimeout(() => setFaceBorderColor("gray"), 1000);
          retryTimeout = setTimeout(verifyFace, 1500);
        }
      } catch (err) {
        setStatus("❌ Face verification error, retrying...");
        setFaceBorderColor("red");
        setTimeout(() => setFaceBorderColor("gray"), 1000);
        retryTimeout = setTimeout(verifyFace, 1500);
      }
    };

    verifyFace();
    return () => clearTimeout(retryTimeout);
  }, [step, loggedUser]);

  // ---------------- QR Scan ----------------
  const handleScan = (data) => {
    if (!data) return;

    let qrText = data.text || data;
    let sessionData;

    try {
      sessionData = JSON.parse(qrText);
    } catch {
      setStatus("❌ Invalid QR code");
      setQrBorderColor("red");
      setTimeout(() => setQrBorderColor("gray"), 1500);
      return;
    }

    const attemptAttendance = async () => {
      try {
        const res = await api.post("/attendance/mark", {
          userId: loggedUser.userId,
          sessionId: sessionData.sessionId,
          qrToken: sessionData.qrToken,
        });

        if (res.data.success) {
          setStatus("✅ Attendance marked");
          setQrBorderColor("limegreen");
        } else {
          setStatus("❌ Attendance failed, retrying...");
          setQrBorderColor("red");
          setTimeout(() => setQrBorderColor("gray"), 1500);
          setTimeout(attemptAttendance, 1500);
        }
      } catch {
        setStatus("❌ QR error, retrying...");
        setQrBorderColor("red");
        setTimeout(() => setQrBorderColor("gray"), 1500);
        setTimeout(attemptAttendance, 1500);
      }
    };

    attemptAttendance();
  };

  const handleError = (err) => console.error("QR Scanner error:", err);

  return (
    <div style={{ padding: 20 }}>
      <h3>Student Login & Attendance</h3>

      {loggedUser && (
        <button onClick={() => {
          stopCamera();
          setLoggedUser(null);
          setStep("login");
          setFaceBorderColor("gray");
          setQrBorderColor("gray");
          setCameraFacingMode("user");
        }}>Logout</button>
      )}

      {step === "login" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input placeholder="User ID" value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })} />
          <input type="password" placeholder="Password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <button onClick={handleLogin}>Login</button>
        </div>
      )}

      {step === "face" && (
        <div>
          <p>Face Verification (Automatic)</p>
          <video ref={videoRef} autoPlay playsInline style={{ width: 300, border: `4px solid ${faceBorderColor}` }} />
          <p>{status}</p>
        </div>
      )}

      {step === "qr" && (
        <div>
          <p>Scan Teacher QR</p>
          <QrScanner
            key={qrKey}
            delay={300}
            style={{ width: 300, border: `4px solid ${qrBorderColor}` }}
            onError={handleError}
            onScan={handleScan}
            facingMode={cameraFacingMode} // back camera for mobile
          />
          <p>{status}</p>
        </div>
      )}
    </div>
  );
}

import React, { useRef, useState, useEffect } from "react";
import QrScanner from "react-qr-scanner";
import api from "./api";

export default function StudentLogin() {
  const [form, setForm] = useState({ userId: "", password: "" });
  const [loggedUser, setLoggedUser] = useState(null);
  const [step, setStep] = useState("login"); // login -> face -> qr
  const [status, setStatus] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [faceBorderColor, setFaceBorderColor] = useState("gray");
  const [qrBorderColor, setQrBorderColor] = useState("gray");
  const [qrKey, setQrKey] = useState(0);
  const [scannerActive, setScannerActive] = useState(true);

  const faceVideoRef = useRef(null); // for face verification (front camera)
  const snapshotVideoRef = useRef(null); // for snapshots during QR step (back camera)
  const snapshotStreamRef = useRef(null);

  const [cameras, setCameras] = useState([]);
  const [selectedCamera, setSelectedCamera] = useState(null);

  /* ---------------- Camera list ---------------- */
  useEffect(() => {
    (async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter((d) => d.kind === "videoinput");
        setCameras(videoDevices);
        // default: prefer front for face verification
        const front = videoDevices.find((d) => d.label.toLowerCase().includes("front"));
        setSelectedCamera(front ? front.deviceId : videoDevices[0]?.deviceId);
      } catch (err) {
        console.error("device enumerate error:", err);
      }
    })();
  }, []);

  /* ---------------- camera helpers ---------------- */
  const startFaceCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      if (faceVideoRef.current) faceVideoRef.current.srcObject = stream;
      await new Promise((res) => {
        if (faceVideoRef.current.readyState >= 2) return res();
        faceVideoRef.current.addEventListener("loadedmetadata", res, { once: true });
      });
      faceVideoRef.current.play().catch(() => {});
    } catch (err) {
      console.error("startFaceCamera error:", err);
      setStatus("⚠️ Cannot access camera");
    }
  };

  const startSnapshotCamera = async (deviceId) => {
    // used to capture a frame when scanning QR
    try {
      if (snapshotStreamRef.current) {
        snapshotStreamRef.current.getTracks().forEach((t) => t.stop());
        snapshotStreamRef.current = null;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: deviceId ? { exact: deviceId } : undefined } });
      snapshotStreamRef.current = stream;
      if (snapshotVideoRef.current) snapshotVideoRef.current.srcObject = stream;
      await new Promise((res) => {
        if (snapshotVideoRef.current.readyState >= 2) return res();
        snapshotVideoRef.current.addEventListener("loadedmetadata", res, { once: true });
      });
      snapshotVideoRef.current.play().catch(() => {});
    } catch (err) {
      console.error("startSnapshotCamera error:", err);
      setStatus("⚠️ Cannot open snapshot camera");
    }
  };

  const stopSnapshotCamera = () => {
    try {
      if (snapshotStreamRef.current) {
        snapshotStreamRef.current.getTracks().forEach((t) => t.stop());
        snapshotStreamRef.current = null;
      }
      if (snapshotVideoRef.current) snapshotVideoRef.current.srcObject = null;
    } catch (err) {
      console.warn("stopSnapshotCamera:", err);
    }
  };

  const stopFaceCamera = () => {
    try {
      const s = faceVideoRef.current?.srcObject;
      if (s && s.getTracks) s.getTracks().forEach((t) => t.stop());
      if (faceVideoRef.current) faceVideoRef.current.srcObject = null;
    } catch (err) {
      console.warn("stopFaceCamera:", err);
    }
  };

  /* ---------------- Login ---------------- */
  const handleLogin = async () => {
    if (!form.userId || !form.password) return alert("Enter userId and password");
    try {
      const res = await api.post("/login", form);
      if (res.data.success && res.data.role === "student") {
        setLoggedUser(res.data);
        setStep("face");
        setStatus("Initializing camera...");
        await startFaceCamera();
      } else {
        alert(res.data.error || "Login failed");
      }
    } catch (err) {
      alert("Login error: " + (err?.response?.data?.error || err.message));
    }
  };

  /* ---------------- Face verification loop ---------------- */
  useEffect(() => {
    if (step !== "face" || !loggedUser) return;
    let intervalId = null;

    const doCheck = async () => {
      if (!faceVideoRef.current) return;
      const vw = faceVideoRef.current.videoWidth;
      const vh = faceVideoRef.current.videoHeight;
      if (!vw || !vh) return;

      const canvas = document.createElement("canvas");
      canvas.width = vw;
      canvas.height = vh;
      canvas.getContext("2d").drawImage(faceVideoRef.current, 0, 0, vw, vh);
      const imageBase64 = canvas.toDataURL("image/jpeg");

      try {
        const res = await api.post("/verifyFaceOnly", { userId: loggedUser.userId, imageBase64 });
        if (res.data.success) {
          setStatus("✅ Face verified — now scan QR");
          setFaceBorderColor("limegreen");
          stopFaceCamera();
          // prepare snapshot camera (prefer back device)
          const backCam = cameras.find((d) => d.label.toLowerCase().includes("back") || d.label.toLowerCase().includes("rear"));
          const deviceId = backCam ? backCam.deviceId : selectedCamera;
          await startSnapshotCamera(deviceId);
          setSelectedCamera(deviceId);
          setStep("qr");
        } else {
          setStatus("❌ Face not matched — retrying...");
          setFaceBorderColor("red");
          setTimeout(() => setFaceBorderColor("gray"), 800);
        }
      } catch (err) {
        console.error("verifyFaceOnly error:", err);
        setStatus("⚠️ Error verifying face");
      }
    };

    intervalId = setInterval(doCheck, 2200);
    // run immediately as well
    doCheck();

    return () => clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, loggedUser, cameras, selectedCamera]);

  /* ---------------- QR Scan handler ---------------- */
  const handleScan = async (data) => {
    if (!data || !scannerActive) return;
    try {
      const qrText = data?.text || data;
      let parsed;
      try {
        parsed = JSON.parse(qrText);
      } catch {
        setStatus("⚠️ Invalid QR format");
        setQrBorderColor("red");
        return;
      }
      if (!parsed.sessionId || !parsed.qrToken) {
        setStatus("⚠️ Expired or invalid QR code");
        setQrBorderColor("red");
        return;
      }
      setSessionId(parsed.sessionId);

      // Take snapshot from snapshotVideoRef (we started the same device)
      if (!snapshotVideoRef.current) {
        setStatus("⚠️ Snapshot camera not ready");
        return;
      }
      const vw = snapshotVideoRef.current.videoWidth || 320;
      const vh = snapshotVideoRef.current.videoHeight || 240;
      const canvas = document.createElement("canvas");
      canvas.width = vw;
      canvas.height = vh;
      canvas.getContext("2d").drawImage(snapshotVideoRef.current, 0, 0, vw, vh);
      const imageBase64 = canvas.toDataURL("image/jpeg");

      const res = await api.post("/markAttendanceLive", { userId: loggedUser.userId, sessionId: parsed.sessionId, imageBase64 });
      if (res.data.success) {
        setStatus("✅ Attendance marked (pending teacher finalize)");
        setQrBorderColor("limegreen");
        setScannerActive(false);
        // optionally stop snapshot camera to save power
        stopSnapshotCamera();
      } else {
        setStatus("❌ " + (res.data.error || "Failed to mark attendance"));
        setQrBorderColor("red");
      }
    } catch (err) {
      console.error("handleScan error:", err);
      setStatus("⚠️ QR scan error");
      setQrBorderColor("orange");
    }
  };

  const handleError = (err) => {
    console.error("QR scanner error:", err);
    setStatus("⚠️ QR scanner error");
    setQrBorderColor("red");
  };

  const swapCamera = async () => {
    if (!cameras.length) return;
    const idx = cameras.findIndex((c) => c.deviceId === selectedCamera);
    const next = cameras[(idx + 1) % cameras.length];
    setSelectedCamera(next.deviceId);
    setQrKey((p) => p + 1);
    // restart snapshot camera to new device
    await startSnapshotCamera(next.deviceId);
  };

  /* ---------------- Logout ---------------- */
  const handleLogout = () => {
    stopFaceCamera();
    stopSnapshotCamera();
    setLoggedUser(null);
    setStep("login");
    setForm({ userId: "", password: "" });
    setStatus("");
    setSessionId("");
    setFaceBorderColor("gray");
    setQrBorderColor("gray");
    setScannerActive(true);
  };

  /* ---------------- UI ---------------- */
  return (
    <div style={{ padding: 20 }}>
      <h3>Student Login & Attendance</h3>

      {loggedUser && (
        <button onClick={handleLogout} style={{ position: "fixed", top: 10, right: 10, background: "#f44336", color: "#fff", padding: 8 }}>
          Logout
        </button>
      )}

      {step === "login" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <input placeholder="User ID" value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })} />
          <input type="password" placeholder="Password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <button onClick={handleLogin} style={{ background: "#28a745", color: "#fff", padding: 8 }}>Login</button>
        </div>
      )}

      {step === "face" && (
        <div>
          <p>Step: Face Verification</p>
          <video ref={faceVideoRef} autoPlay playsInline width={320} height={240} style={{ border: `4px solid ${faceBorderColor}`, borderRadius: 6 }} />
          <p>{status}</p>
        </div>
      )}

      {step === "qr" && (
        <div style={{ width: 360 }}>
          <p>Step: Scan Teacher QR to mark attendance</p>
          <button onClick={swapCamera} style={{ marginBottom: 8, padding: 6 }}>Swap Camera</button>
          <div style={{ border: `4px solid ${qrBorderColor}`, padding: 6, borderRadius: 6 }}>
            {scannerActive ? (
              <QrScanner
                key={qrKey}
                delay={400}
                onError={handleError}
                onScan={handleScan}
                style={{ width: "100%" }}
                constraints={selectedCamera ? { video: { deviceId: { exact: selectedCamera } } } : undefined}
              />
            ) : (
              <div style={{ padding: 14, textAlign: "center" }}>Scanner paused</div>
            )}
          </div>

          {/* hidden snapshot video from same device for frame capture */}
          <video ref={snapshotVideoRef} autoPlay playsInline style={{ display: "none" }} />

          <p>{status}</p>
        </div>
      )}
    </div>
  );
}

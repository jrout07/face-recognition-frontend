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

  const videoRef = useRef(null); // used for snapshot
  const streamRef = useRef(null);

  const [cameras, setCameras] = useState([]);
  const [selectedCamera, setSelectedCamera] = useState(null);

  /* ---------------- Camera Helpers ---------------- */
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  const startCamera = async (facingMode = "user") => {
    if (!videoRef.current) return;
    stopCamera();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode },
      });
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
    } catch (err) {
      alert("Cannot access camera: " + err.message);
    }
  };

  /* ---------------- QR Camera Setup ---------------- */
  useEffect(() => {
    async function loadCameras() {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter((d) => d.kind === "videoinput");
        setCameras(videoDevices);

        const backCam = videoDevices.find(
          (d) =>
            d.label.toLowerCase().includes("back") ||
            d.label.toLowerCase().includes("rear")
        );
        setSelectedCamera(backCam ? backCam.deviceId : videoDevices[0]?.deviceId);
      } catch (err) {
        console.error("Error loading cameras:", err);
      }
    }
    loadCameras();
  }, []);

  const swapCamera = () => {
    if (cameras.length < 2) return;
    const currentIndex = cameras.findIndex((c) => c.deviceId === selectedCamera);
    const nextIndex = (currentIndex + 1) % cameras.length;
    setSelectedCamera(cameras[nextIndex].deviceId);
    setQrKey((prev) => prev + 1);
    // Restart hidden videoRef
    navigator.mediaDevices
      .getUserMedia({ video: { deviceId: { exact: cameras[nextIndex].deviceId } } })
      .then((stream) => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          streamRef.current = stream;
          videoRef.current.play();
        }
      });
  };

  /* ---------------- Login ---------------- */
  const handleLogin = async () => {
    if (!form.userId || !form.password)
      return alert("Enter userId and password");
    try {
      const res = await api.post("/login", form);
      if (res.data.success && res.data.role === "student") {
        setLoggedUser(res.data);
        setStep("face");
        setFaceBorderColor("gray");
        setStatus("Initializing camera...");
      } else alert(res.data.error || "Login failed");
    } catch (err) {
      alert("Login error: " + (err.response?.data?.error || err.message));
    }
  };

  /* ---------------- Face Verification ---------------- */
  useEffect(() => {
    if (step !== "face" || !loggedUser) return;
    let retryInterval;

    const checkFace = async () => {
      if (!videoRef.current) return;
      if (videoRef.current.videoWidth === 0 || videoRef.current.videoHeight === 0) return;

      const canvas = document.createElement("canvas");
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      canvas.getContext("2d").drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const imageBase64 = canvas.toDataURL("image/jpeg");

      try {
        const faceRes = await api.post("/verifyFaceOnly", {
          userId: loggedUser.userId,
          imageBase64,
        });

        if (faceRes.data.success) {
          setStatus("✅ Face verified! Moving to QR...");
          setFaceBorderColor("limegreen");

          clearInterval(retryInterval);

          setTimeout(async () => {
            // Switch to back camera but KEEP it open for snapshots
            const backCam = cameras.find(
              (d) =>
                d.label.toLowerCase().includes("back") ||
                d.label.toLowerCase().includes("rear")
            );
            if (backCam) {
              const stream = await navigator.mediaDevices.getUserMedia({
                video: { deviceId: { exact: backCam.deviceId } },
              });
              if (videoRef.current) {
                videoRef.current.srcObject = stream;
                streamRef.current = stream;
                await videoRef.current.play();
              }
              setSelectedCamera(backCam.deviceId);
              setQrKey((prev) => prev + 1);
            }

            setStep("qr");
            setScannerActive(true);
          }, 1000);
        } else {
          setStatus("❌ Face not matched, retrying...");
          setFaceBorderColor("red");
          setTimeout(() => setFaceBorderColor("gray"), 1000);
        }
      } catch (err) {
        console.error("Face check error:", err);
        setStatus("⚠️ Error verifying face...");
      }
    };

    startCamera("user").then(() => {
      retryInterval = setInterval(checkFace, 2000);
    });

    return () => clearInterval(retryInterval);
  }, [step, loggedUser, cameras]);

  /* ---------------- QR Scan + Attendance ---------------- */
  const handleScan = async (data) => {
    if (!data || !scannerActive) return;

    try {
      const qrText = data.text || data;
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

      // Take snapshot from hidden videoRef
      const canvas = document.createElement("canvas");
      canvas.width = videoRef.current?.videoWidth || 320;
      canvas.height = videoRef.current?.videoHeight || 240;
      canvas.getContext("2d").drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const imageBase64 = canvas.toDataURL("image/jpeg");

      const res = await api.post("/markAttendanceLive", {
        userId: loggedUser.userId,
        sessionId: parsed.sessionId,
        imageBase64,
      });

      if (res.data.success) {
        setStatus("✅ Attendance marked (awaiting teacher finalize)");
        setQrBorderColor("limegreen");
        setScannerActive(false);
      } else if (res.data.error?.toLowerCase().includes("already")) {
        setStatus("✅ Already marked (pending finalize)");
        setQrBorderColor("limegreen");
        setScannerActive(false);
      } else {
        setStatus("❌ " + (res.data.error || "Failed to mark attendance"));
        setQrBorderColor("red");
      }
    } catch (err) {
      console.error("QR scan error:", err);
      setStatus("⚠️ QR error — retry with next code");
      setQrBorderColor("orange");
    }
  };

  /* ---------------- Logout ---------------- */
  const handleLogout = () => {
    stopCamera();
    setLoggedUser(null);
    setStep("login");
    setForm({ userId: "", password: "" });
    setStatus("");
    setSessionId("");
    setFaceBorderColor("gray");
    setQrBorderColor("gray");
    setScannerActive(false);
  };

  /* ---------------- UI ---------------- */
  return (
    <div style={{ padding: 20 }}>
      <h3>Student Login & Attendance</h3>

      {loggedUser && (
        <button
          onClick={handleLogout}
          style={{
            position: "fixed",
            top: 10,
            right: 10,
            padding: "8px 16px",
            backgroundColor: "#f44336",
            color: "white",
            border: "none",
            borderRadius: 5,
            cursor: "pointer",
          }}
        >
          Logout
        </button>
      )}

      {step === "login" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input
            placeholder="User ID"
            value={form.userId}
            onChange={(e) => setForm({ ...form, userId: e.target.value })}
          />
          <input
            type="password"
            placeholder="Password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          <button onClick={handleLogin} style={{ backgroundColor: "#28a745", color: "white" }}>
            Login
          </button>
        </div>
      )}

      {step === "face" && (
        <div>
          <p>Step: Face Verification</p>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            width="320"
            height="240"
            style={{ border: `5px solid ${faceBorderColor}`, borderRadius: 5 }}
          />
          <p>{status}</p>
        </div>
      )}

      {step === "qr" && (
        <div style={{ position: "relative", width: 320 }}>
          <p>Step: Scan Teacher QR to mark attendance</p>
          <button onClick={swapCamera}>Swap Camera</button>
          <div style={{ border: `5px solid ${qrBorderColor}`, borderRadius: 5 }}>
            {scannerActive ? (
              <QrScanner
                key={qrKey}
                delay={400}
                style={{ width: "100%" }}
                onScan={handleScan}
                constraints={{
                  video: selectedCamera ? { deviceId: { exact: selectedCamera } } : undefined,
                }}
              />
            ) : (
              <p>Scanner paused</p>
            )}
          </div>

          {/* Hidden video feed for snapshot */}
          <video ref={videoRef} autoPlay playsInline style={{ display: "none" }} />

          <p>{status}</p>
        </div>
      )}
    </div>
  );
}

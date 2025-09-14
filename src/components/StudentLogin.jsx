// frontend/src/components/StudentDashboard.jsx
import React, { useState, useEffect, useRef } from "react";
import QrScanner from "qr-scanner";
import api from "./api";

const StudentDashboard = ({ loggedUser }) => {
  const [step, setStep] = useState("verify");
  const [status, setStatus] = useState("⏳ Starting face verification...");
  const [qrBorderColor, setQrBorderColor] = useState("gray");
  const [scannerActive, setScannerActive] = useState(false);
  const qrVideoContainerRef = useRef(null);
  const qrScannerRef = useRef(null);

  // -------------------- Face Verification --------------------
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

        const res = await api.post("/verifyFaceOnly", { userId: loggedUser.userId, imageBase64 });

        stream.getTracks().forEach((t) => t.stop());

        if (res.data.success) {
          setStatus("✅ Face verified! Scan the QR now.");
          setStep("scanQR");
        } else {
          setStatus("❌ Face not recognized.");
        }
      } catch (err) {
        console.error("Face verification error:", err);
        setStatus("⚠️ Error verifying face.");
      }
    };

    if (step === "verify") verifyFace();
  }, [step, loggedUser.userId]);

  // -------------------- Setup QR Scanner --------------------
  useEffect(() => {
    if (step !== "scanQR" || !qrVideoContainerRef.current) return;

    const videoElem = document.createElement("video");
    qrVideoContainerRef.current.innerHTML = "";
    qrVideoContainerRef.current.appendChild(videoElem);

    qrScannerRef.current = new QrScanner(videoElem, (result) => handleScan(result), {
      highlightScanRegion: true,
      highlightCodeOutline: true,
    });

    qrScannerRef.current.start();
    setScannerActive(true);

    return () => qrScannerRef.current?.stop();
  }, [step]);

  // -------------------- Handle QR Scan --------------------
  const handleScan = async (data) => {
    if (!data || !scannerActive) return;

    try {
      const qrText = data.data || data.text || data;
      console.log("Student scanned QR raw:", qrText);

      let parsed;
      try {
        parsed = JSON.parse(qrText);
        if (typeof parsed === "string") parsed = JSON.parse(parsed);
      } catch {
        console.error("Failed to parse QR:", qrText);
        setStatus("⚠️ Invalid QR");
        setQrBorderColor("red");
        return;
      }

      console.log("Student parsed QR:", parsed);

      if (!parsed.sessionId || !parsed.qrToken) {
        setStatus("⚠️ Invalid or expired QR");
        setQrBorderColor("red");
        return;
      }

      // Take snapshot
      const videoElem = qrVideoContainerRef.current.querySelector("video");
      const canvas = document.createElement("canvas");
      canvas.width = videoElem.videoWidth || 320;
      canvas.height = videoElem.videoHeight || 240;
      canvas.getContext("2d").drawImage(videoElem, 0, 0, canvas.width, canvas.height);
      const imageBase64 = canvas.toDataURL("image/jpeg");

      const res = await api.post("/markAttendanceLive", {
        userId: loggedUser.userId,
        sessionId: parsed.sessionId,
        qrToken: parsed.qrToken,
        imageBase64,
      });

      if (res.data.success) {
        setStatus("✅ Attendance marked!");
        setQrBorderColor("limegreen");
        setScannerActive(false);
        qrScannerRef.current?.stop();
        setStep("done");
      } else {
        setStatus("❌ " + (res.data.error || "Failed"));
        setQrBorderColor("red");
      }
    } catch (err) {
      console.error("QR scan error:", err);
      setStatus("⚠️ QR error");
      setQrBorderColor("orange");
    }
  };

  return (
    <div className="p-6 bg-gray-100 min-h-screen">
      <h1 className="text-xl font-bold mb-4">Student Dashboard</h1>
      {step === "verify" && <p>{status}</p>}
      {step === "scanQR" && (
        <div className="bg-white p-4 rounded shadow">
          <p>{status}</p>
          <div ref={qrVideoContainerRef} className="border-4 rounded-lg" style={{ borderColor: qrBorderColor, width: "100%", maxWidth: 400 }} />
        </div>
      )}
      {step === "done" && <div className="bg-green-100 p-4 rounded">🎉 Attendance recorded!</div>}
    </div>
  );
};

export default StudentDashboard;

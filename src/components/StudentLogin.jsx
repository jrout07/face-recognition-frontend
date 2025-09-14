import React, { useState, useEffect, useRef } from "react";
import QrScanner from "qr-scanner";
import api from "./api";

const StudentDashboard = ({ loggedUser }) => {
  const [step, setStep] = useState("verify"); // verify → scanQR → done
  const [status, setStatus] = useState("⏳ Starting face verification...");
  const [qrBorderColor, setQrBorderColor] = useState("gray");
  const [scannerActive, setScannerActive] = useState(false);
  const qrVideoContainerRef = useRef(null);
  const qrScannerRef = useRef(null);

  /* ---------------- Face Verification ---------------- */
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
        stream.getTracks().forEach((t) => t.stop());

        const res = await api.post("/verifyFaceOnly", {
          userId: loggedUser.userId,
          imageBase64,
        });

        if (res.data.success) {
          setStatus("✅ Face verified! Proceed to scan QR.");
          setStep("scanQR");
        } else {
          setStatus("❌ Face not recognized. Retry login.");
        }
      } catch (err) {
        console.error("Face verification error:", err);
        setStatus("⚠️ Error verifying face. Please retry.");
      }
    };

    if (step === "verify") verifyFace();
  }, [step, loggedUser.userId]);

  /* ---------------- Setup QR Scanner ---------------- */
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

    return () => {
      qrScannerRef.current?.stop();
    };
  }, [step]);

  /* ---------------- Handle QR Scan ---------------- */
  const handleScan = async (data) => {
    if (!data || !scannerActive) return;

    try {
      const qrText = data.data || data.text || data;
      let parsed;

      try {
        parsed = JSON.parse(qrText);
      } catch {
        console.error("Invalid QR text:", qrText);
        setStatus("⚠️ Invalid QR format");
        setQrBorderColor("red");
        return;
      }

      if (!parsed.sessionId || !parsed.qrToken) {
        setStatus("⚠️ Expired/invalid QR — waiting for new one...");
        setQrBorderColor("red");
        setTimeout(() => {
          setQrBorderColor("gray");
          setStatus("⏳ Waiting for valid QR...");
        }, 1500);
        return;
      }

      // Take snapshot for face proof
      const videoElem = qrVideoContainerRef.current.querySelector("video");
      if (!videoElem) {
        setStatus("⚠️ Camera not ready");
        return;
      }

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
        setStatus("✅ Attendance marked (awaiting teacher finalize)");
        setQrBorderColor("limegreen");
        setScannerActive(false);
        qrScannerRef.current?.stop();
        setStep("done");
      } else if (res.data.error?.toLowerCase().includes("already")) {
        setStatus("✅ Already marked (pending finalize)");
        setQrBorderColor("limegreen");
        setScannerActive(false);
        qrScannerRef.current?.stop();
        setStep("done");
      } else {
        setStatus("❌ " + (res.data.error || "Failed to mark attendance"));
        setQrBorderColor("red");
        setTimeout(() => setQrBorderColor("gray"), 1500);
      }
    } catch (err) {
      console.error("QR scan error:", err);
      setStatus("⚠️ QR error — waiting for next code");
      setQrBorderColor("orange");
      setTimeout(() => setQrBorderColor("gray"), 1500);
    }
  };

  /* ---------------- UI ---------------- */
  return (
    <div className="p-6 bg-gray-100 min-h-screen">
      <h1 className="text-xl font-bold mb-4">Student Login & Attendance</h1>

      {step === "verify" && <p className="text-blue-600 font-medium">{status}</p>}

      {step === "scanQR" && (
        <div className="bg-white p-4 rounded shadow">
          <p className="mb-2">{status}</p>
          <div
            ref={qrVideoContainerRef}
            className="border-4 rounded-lg overflow-hidden"
            style={{ borderColor: qrBorderColor, width: "100%", maxWidth: 400 }}
          />
        </div>
      )}

      {step === "done" && (
        <div className="bg-green-100 text-green-700 p-4 rounded shadow">
          🎉 Attendance recorded successfully!
        </div>
      )}
    </div>
  );
};

export default StudentDashboard;

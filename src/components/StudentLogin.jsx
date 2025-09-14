import React, { useRef, useState, useEffect } from 'react';
import QrScanner from 'react-qr-scanner';
import api from './api';

export default function StudentLogin() {
  const [form, setForm] = useState({ userId: '', password: '' });
  const [loggedUser, setLoggedUser] = useState(null);
  const [step, setStep] = useState('login'); // login -> face -> qr
  const [status, setStatus] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [faceBorderColor, setFaceBorderColor] = useState('gray');
  const [qrBorderColor, setQrBorderColor] = useState('gray');
  const [qrKey, setQrKey] = useState(0);
  const [scannerActive, setScannerActive] = useState(true);

  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const [cameras, setCameras] = useState([]);
  const [selectedCamera, setSelectedCamera] = useState(null);

  /* ---------------- Camera Helpers ---------------- */
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  const startCamera = async (facingMode = 'user') => {
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
      alert('Cannot access camera: ' + err.message);
    }
  };

  /* ---------------- QR Camera Setup ---------------- */
  useEffect(() => {
    async function loadCameras() {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(d => d.kind === 'videoinput');
        setCameras(videoDevices);

        const backCam = videoDevices.find(d =>
          d.label.toLowerCase().includes('back') ||
          d.label.toLowerCase().includes('rear')
        );
        setSelectedCamera(backCam ? backCam.deviceId : videoDevices[0]?.deviceId);
      } catch (err) {
        console.error('Error loading cameras:', err);
      }
    }
    loadCameras();
  }, []);

  const swapCamera = () => {
    if (cameras.length < 2) return;
    const currentIndex = cameras.findIndex(c => c.deviceId === selectedCamera);
    const nextIndex = (currentIndex + 1) % cameras.length;
    setSelectedCamera(cameras[nextIndex].deviceId);
    setQrKey(prev => prev + 1);
  };

  const useBackCamera = () => {
    const backCam = cameras.find(d =>
      d.label.toLowerCase().includes('back') ||
      d.label.toLowerCase().includes('rear')
    );
    if (backCam) {
      setSelectedCamera(backCam.deviceId);
      setQrKey(prev => prev + 1);
    }
  };

  /* ---------------- Login ---------------- */
  const handleLogin = async () => {
    if (!form.userId || !form.password) return alert('Enter userId and password');
    try {
      const res = await api.post('/login', form);
      if (res.data.success && res.data.role === 'student') {
        setLoggedUser(res.data);
        setStep('face');
        setFaceBorderColor('gray');
        setStatus('Initializing camera...');
      } else alert(res.data.error || 'Login failed');
    } catch (err) {
      alert('Login error: ' + (err.response?.data?.error || err.message));
    }
  };

  /* ---------------- Face Verification ---------------- */
  useEffect(() => {
    if (step !== "face" || !loggedUser) return;
    let retryInterval;

    const checkFace = async () => {
      if (!videoRef.current) return;

      if (videoRef.current.videoWidth === 0 || videoRef.current.videoHeight === 0) {
        videoRef.current.onloadedmetadata = () => checkFace();
        return;
      }

      const canvas = document.createElement("canvas");
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      canvas.getContext("2d").drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const imageBase64 = canvas.toDataURL("image/jpeg").split(",")[1];

      try {
        const faceRes = await api.post("/markAttendanceLive", {
          userId: loggedUser.userId,
          imageBase64,
        });

        if (faceRes.data.success) {
          setStatus("✅ Face verified! Moving to QR...");
          setFaceBorderColor("limegreen");
          stopCamera();

          setTimeout(() => {
            useBackCamera();
            setStep("qr");
            setScannerActive(true);
          }, 1000);

          clearInterval(retryInterval);
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
      retryInterval = setInterval(checkFace, 2000); // every 2 sec
    });

    return () => clearInterval(retryInterval);
  }, [step, loggedUser]);

 /* ---------------- QR Scan ---------------- */
const handleScan = async data => {
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

    const res = await api.post("/attendance/mark", {
      userId: loggedUser.userId,
      sessionId: parsed.sessionId,
      qrToken: parsed.qrToken,
    });

    if (res.data.success) {
      setStatus("✅ Attendance marked");
      setQrBorderColor("limegreen");
      setScannerActive(false);
    } else if (res.data.error === "Attendance already marked") {
      setStatus("✅ You’ve already marked attendance");
      setQrBorderColor("limegreen");
      setScannerActive(false);
    } else if (res.data.error?.toLowerCase().includes("expired")) {
      setStatus("⏳ QR expired, refreshing...");
      setQrBorderColor("orange");

      // 🔁 Restart scanner automatically after short delay
      setTimeout(() => {
        setQrKey(prev => prev + 1); // force QrScanner re-mount
        setScannerActive(true);
        setStatus("📷 Ready — scan the latest QR code");
        setQrBorderColor("gray");
      }, 2000);
    } else {
      setStatus("❌ " + (res.data.error || "Attendance failed"));
      setQrBorderColor("red");

      // Reset border after 2s
      setTimeout(() => setQrBorderColor("gray"), 2000);
    }
  } catch (err) {
    console.error("QR scan error:", err);
    setStatus("⚠️ QR error — maybe expired, waiting for refresh...");
    setQrBorderColor("orange");

    // 🔁 Restart scanner to retry
    setTimeout(() => {
      setQrKey(prev => prev + 1);
      setScannerActive(true);
      setStatus("📷 Ready — scan the latest QR code");
      setQrBorderColor("gray");
    }, 2000);
  }
};

  /* ---------------- QR Error Handler ---------------- */
  const handleError = err => {
    console.error('QR Scanner error:', err);
    setStatus('⚠️ QR scanner error, please try again');
    setQrBorderColor('red');
  };

  /* ---------------- Logout ---------------- */
  const handleLogout = () => {
    stopCamera();
    setLoggedUser(null);
    setStep('login');
    setForm({ userId: '', password: '' });
    setStatus('');
    setSessionId('');
    setFaceBorderColor('gray');
    setQrBorderColor('gray');
    setScannerActive(false);
  };

  /* ---------------- UI ---------------- */
  return (
    <div style={{ padding: 20, position: 'relative' }}>
      <h3>Student Login & Attendance</h3>

      {loggedUser && (
        <button
          onClick={handleLogout}
          style={{
            position: 'fixed',
            top: 10,
            right: 10,
            padding: '8px 16px',
            backgroundColor: '#f44336',
            color: 'white',
            border: 'none',
            borderRadius: 5,
            cursor: 'pointer',
            zIndex: 1000,
          }}
        >
          Logout
        </button>
      )}

      {step === 'login' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input
            placeholder="User ID"
            value={form.userId}
            onChange={e => setForm({ ...form, userId: e.target.value })}
            style={{ padding: '8px', borderRadius: 5, border: '1px solid #ccc' }}
          />
          <input
            type="password"
            placeholder="Password"
            value={form.password}
            onChange={e => setForm({ ...form, password: e.target.value })}
            style={{ padding: '8px', borderRadius: 5, border: '1px solid #ccc' }}
          />
          <button
            onClick={handleLogin}
            style={{
              padding: '10px 16px',
              borderRadius: 5,
              border: 'none',
              backgroundColor: '#28a745',
              color: 'white',
              fontWeight: 'bold',
              cursor: 'pointer',
            }}
          >
            Login
          </button>
        </div>
      )}

      {step === 'face' && (
        <div style={{ position: 'relative', width: 320, height: 240 }}>
          <p>Step: Face Verification</p>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            width="320"
            height="240"
            style={{ border: `5px solid ${faceBorderColor}`, borderRadius: 5 }}
          />
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              backgroundColor: 'rgba(0,0,0,0.3)',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 16,
              fontWeight: 'bold',
            }}
          >
            {status}
          </div>
        </div>
      )}

      {step === 'qr' && (
        <div style={{ position: 'relative', width: 320 }}>
          <p>Step: Scan Teacher QR to mark attendance</p>
          <button
            onClick={swapCamera}
            style={{
              marginBottom: 5,
              padding: '5px 10px',
              borderRadius: 5,
              backgroundColor: '#007bff',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Swap Camera
          </button>
          <div style={{ border: `5px solid ${qrBorderColor}`, borderRadius: 5, padding: 5 }}>
            {scannerActive ? (
              <QrScanner
                key={qrKey}
                delay={400}
                style={{ width: '100%' }}
                onError={handleError}
                onScan={handleScan}
                constraints={{
                  video: selectedCamera ? { deviceId: { exact: selectedCamera } } : undefined,
                }}
              />
            ) : (
              <p style={{ color: 'gray', textAlign: 'center' }}>Scanner paused</p>
            )}
          </div>
          <p>{status}</p>
        </div>
      )}
    </div>
  );
}

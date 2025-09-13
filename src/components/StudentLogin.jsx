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
  const [qrKey, setQrKey] = useState(0); // force QR remount
  const [scannerActive, setScannerActive] = useState(true); // ✅ control QR scanner

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
    setQrKey(prev => prev + 1); // re-mount scanner
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
/* ---------------- Face Verification with Blink ---------------- */
useEffect(() => {
  if (step !== 'face' || !loggedUser) return;
  let retryInterval;
  let blinkDetected = false;
  let lastEyesOpen = true; // assume open at start

  const checkLiveness = async () => {
    if (!videoRef.current) return;

    if (videoRef.current.videoWidth === 0 || videoRef.current.videoHeight === 0) {
      videoRef.current.onloadedmetadata = () => checkLiveness();
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    canvas.getContext('2d').drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    const imageBase64 = canvas.toDataURL('image/jpeg');

    try {
      const res = await api.post('/checkLiveness', {
  imageBase64: imageBase64.split(",")[1],
});


      if (res.data.success) {
        const eyesOpen = res.data.eyesOpen;

        if (lastEyesOpen && !eyesOpen) {
          setStatus("👀 Eyes closed detected, keep blinking...");
        }

        if (!lastEyesOpen && eyesOpen) {
          blinkDetected = true;
          setStatus("✅ Blink detected! Verifying face...");
        }

        lastEyesOpen = eyesOpen;

        if (blinkDetected) {
          // Once blink is detected, send for face match
          const faceRes = await api.post('/markAttendanceLive', {
            userId: loggedUser.userId,
            imageBase64: imageBase64.split(',')[1], // strip header
            blinkVerified: true,   // 👁 tell backend blink happened
            sessionId,             // 👨‍🎓 include sessionId
          });

          if (faceRes.data.success) {
            setStatus("✅ Blink + Face verified! Moving to QR...");
            setFaceBorderColor("limegreen");
            stopCamera();

            setTimeout(() => {
              useBackCamera();
              setStep("qr");
              setScannerActive(true);
            }, 1000);

            clearInterval(retryInterval); // stop checking further
          } else {
            setStatus("❌ Face not matched after blink, retrying...");
            setFaceBorderColor("red");
            setTimeout(() => setFaceBorderColor("gray"), 1000);
          }
        } else {
          setStatus("Please blink your eyes to continue...");
        }
      } else {
        setStatus("⚠️ No face detected, adjust camera...");
      }
    } catch (err) {
      console.error("Blink check error:", err);
      setStatus("⚠️ Error checking blink...");
    }
  };

  startCamera("user").then(() => {
    retryInterval = setInterval(checkLiveness, 1200); // check every 1.2s
  });

  return () => clearInterval(retryInterval);
}, [step, loggedUser, sessionId]);


  /* ---------------- QR Scan ---------------- */
  const handleScan = async data => {
    if (!data || !scannerActive) return; // ✅ ignore if scanner is disabled

    try {
      const qrText = data.text || data;

      let parsed;
      try {
        parsed = JSON.parse(qrText);
      } catch {
        setStatus('⚠️ Invalid QR format');
        setQrBorderColor('red');
        return;
      }

      if (!parsed.sessionId || !parsed.qrToken) {
        setStatus('⚠️ Expired or invalid QR code');
        setQrBorderColor('red');
        return;
      }

      setSessionId(parsed.sessionId);

      const res = await api.post('/attendance/mark', {
        userId: loggedUser.userId,
        sessionId: parsed.sessionId,
        qrToken: parsed.qrToken,
      });

      if (res.data.success) {
        setStatus('✅ Attendance marked');
        setQrBorderColor('limegreen');
        setScannerActive(false); // ✅ stop further scans after success
      } else if (res.data.error === "Attendance already marked") {
        setStatus('✅ You’ve already marked attendance');
        setQrBorderColor('limegreen');
        setScannerActive(false); // ✅ also stop scanning again
      } else if (res.data.error?.toLowerCase().includes("expired")) {
        setStatus('⏳ QR expired, waiting for latest code...');
        setQrBorderColor('orange');
        // ⚠️ Do NOT stop scanner — keep scanning until a fresh QR is detected
      } else {
        setStatus('❌ ' + (res.data.error || 'Attendance failed'));
        setQrBorderColor('red');
      }

      setTimeout(() => setQrBorderColor('gray'), 2000);
    } catch (err) {
      console.error('QR scan error:', err);
      setStatus('⚠️ QR error — maybe expired, waiting for refresh...');
      setQrBorderColor('orange');
      // ⚠️ Keep scanner active automatically
    }
  };

  /* ---------------- QR Error Handler ---------------- */
  const handleError = err => {
    console.error('QR Scanner error:', err);
    setStatus('⚠️ QR scanner error, please try again');
    setQrBorderColor('red');
    // Don’t disable scanner → let it recover
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
    setScannerActive(false); // ✅ reset scanner
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
          <p>Step: Face Verification (Automatic)</p>
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

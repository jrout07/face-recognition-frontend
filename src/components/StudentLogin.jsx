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
  const [cameraFacingMode, setCameraFacingMode] = useState('user'); // front by default

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const qrRetryTimeoutRef = useRef(null);
  const faceRetryTimeoutRef = useRef(null);

  // ------------------- Camera -------------------
  const startCamera = async () => {
    if (!videoRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: cameraFacingMode }
      });
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      videoRef.current.play();
    } catch (err) {
      alert('Cannot access camera: ' + err.message);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  const swapCamera = () => {
    stopCamera();
    setCameraFacingMode(prev => (prev === 'user' ? 'environment' : 'user'));
  };

  // Auto-start camera when entering face step
  useEffect(() => {
    if (step === 'face' || step === 'qr') startCamera();
    return () => stopCamera();
  }, [step, cameraFacingMode]);

  // ------------------- Logout -------------------
  const handleLogout = () => {
    stopCamera();
    clearTimeout(qrRetryTimeoutRef.current);
    clearTimeout(faceRetryTimeoutRef.current);
    setLoggedUser(null);
    setStep('login');
    setForm({ userId: '', password: '' });
    setStatus('');
    setSessionId('');
    setFaceBorderColor('gray');
    setQrBorderColor('gray');
    setCameraFacingMode('user');
  };

  // ------------------- Login -------------------
  const handleLogin = async () => {
    if (!form.userId || !form.password) return alert('Enter userId and password');
    try {
      const res = await api.post("/login", form);
      if (res.data.success && res.data.role === 'student') {
        setLoggedUser(res.data);
        setStep('face');
        setFaceBorderColor('gray');
        setStatus('Initializing camera...');
      } else {
        alert(res.data.error || 'Login failed');
      }
    } catch (err) {
      console.error("Login error:", err.response?.data || err.message);
      const errorMsg =
        err.response?.data?.error?.message ||
        err.response?.data?.error ||
        err.message ||
        "Unknown error";
      alert('Login error: ' + errorMsg);
    }
  };

  // ------------------- Face Verification -------------------
  useEffect(() => {
    if (step !== 'face') return;

    const verifyFace = async () => {
      if (!videoRef.current || !videoRef.current.videoWidth || !videoRef.current.videoHeight) {
        setStatus('❌ Video not ready, retrying...');
        faceRetryTimeoutRef.current = setTimeout(verifyFace, 1500);
        return;
      }

      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      canvas.getContext('2d').drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const imageBase64 = canvas.toDataURL('image/jpeg').split(',')[1];

      try {
        const res = await api.post("/markAttendanceLive", {
          userId: loggedUser.userId,
          imageBase64,
        });

        if (res.data.success) {
          setStatus('✅ Face verified! Moving to QR scan...');
          setFaceBorderColor('limegreen');
          stopCamera();
          setTimeout(() => {
            setStep('qr');
            setCameraFacingMode('environment'); // back camera for mobile
          }, 1000);
        } else {
          setStatus('❌ Face not matched, retrying...');
          setFaceBorderColor('red');
          setTimeout(() => setFaceBorderColor('gray'), 1000);
          faceRetryTimeoutRef.current = setTimeout(verifyFace, 1500);
        }
      } catch (err) {
        console.error("Face verification error:", err.response?.data || err.message);
        setStatus('❌ Face verification error, retrying...');
        setFaceBorderColor('red');
        setTimeout(() => setFaceBorderColor('gray'), 1000);
        faceRetryTimeoutRef.current = setTimeout(verifyFace, 1500);
      }
    };

    verifyFace();
    return () => clearTimeout(faceRetryTimeoutRef.current);
  }, [step, loggedUser]);

  // ------------------- QR Scan -------------------
  const handleScan = async (data) => {
    if (!data) return;

    const qrText = data.text || data;
    setSessionId(qrText);

    try {
      const res = await api.post("/attendance/mark", {
        userId: loggedUser.userId,
        sessionId: qrText,
      });

      if (res.data.success) {
        setStatus('✅ Attendance marked');
        setQrBorderColor('limegreen');
        clearTimeout(qrRetryTimeoutRef.current);
      } else {
        setStatus('❌ Attendance failed, retrying...');
        setQrBorderColor('red');
        setTimeout(() => setQrBorderColor('gray'), 1000);
        qrRetryTimeoutRef.current = setTimeout(() => handleScan(data), 1500);
      }
    } catch (err) {
      console.error("QR scan error:", err.response?.data || err.message);
      setStatus('❌ QR error, retrying...');
      setQrBorderColor('red');
      setTimeout(() => setQrBorderColor('gray'), 1000);
      qrRetryTimeoutRef.current = setTimeout(() => handleScan(data), 1500);
    }
  };

  const handleError = (err) => console.error('QR Scanner error:', err);

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
          <div style={{ border: `5px solid ${qrBorderColor}`, borderRadius: 5, padding: 5 }}>
            <QrScanner
              delay={300}
              style={{ width: '100%' }}
              onError={handleError}
              onScan={handleScan}
              facingMode={cameraFacingMode}
            />
          </div>
          <p>{status}</p>
        </div>
      )}
    </div>
  );
}

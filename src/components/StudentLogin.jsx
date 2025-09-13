import React, { useEffect, useState, useRef } from 'react';
import { QrScanner } from '@yudiel/react-qr-scanner';
import api from './api';

export default function StudentLogin({ loggedUser }) {
  const [step, setStep] = useState('face'); // face → qr
  const [status, setStatus] = useState('');
  const [cameras, setCameras] = useState([]);
  const [selectedCamera, setSelectedCamera] = useState(null);
  const [videoStream, setVideoStream] = useState(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [faceBorderColor, setFaceBorderColor] = useState('gray');
  const [qrBorderColor, setQrBorderColor] = useState('gray');
  const [qrKey, setQrKey] = useState(0);

  /* ------------------ Camera Setup ------------------ */
  useEffect(() => {
    async function fetchCameras() {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(d => d.kind === 'videoinput');
      setCameras(videoDevices);

      if (videoDevices.length > 0) {
        setSelectedCamera(videoDevices[0].deviceId);
      }
    }
    fetchCameras();
  }, []);

  useEffect(() => {
    if (step === 'face' && selectedCamera) {
      startCamera();
    }
    return () => stopCamera();
  }, [selectedCamera, step]);

  const startCamera = async () => {
    stopCamera();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: selectedCamera } }
      });
      setVideoStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Camera error:", err);
      setStatus('❌ Cannot access camera');
    }
  };

  const stopCamera = () => {
    if (videoStream) {
      videoStream.getTracks().forEach(track => track.stop());
    }
  };

  /* ------------------ Face Verification ------------------ */
  const captureAndVerify = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    const imageBase64 = canvas.toDataURL('image/jpeg');

    setStatus('⏳ Verifying face...');
    setFaceBorderColor('orange');

    try {
      const res = await api.post('/markAttendanceLive', {
        imageBase64,
        userId: loggedUser.userId,
      });

      if (res.data.success) {
        setStatus('✅ Face verified! Moving to QR scan...');
        setFaceBorderColor('limegreen');
        stopCamera();

        setTimeout(() => {
          // 🔥 Inline auto-switch to back camera
          const backCam = cameras.find(d =>
            d.label.toLowerCase().includes('back') ||
            d.label.toLowerCase().includes('rear')
          );
          if (backCam) {
            setSelectedCamera(backCam.deviceId);
          }
          setQrKey(prev => prev + 1); // force remount scanner
          setStep('qr');              // then move to QR step
        }, 1000);
      } else {
        setStatus('❌ ' + res.data.message);
        setFaceBorderColor('red');
        setTimeout(() => setFaceBorderColor('gray'), 1500);
      }
    } catch (err) {
      console.error(err);
      setStatus('❌ Error verifying face');
      setFaceBorderColor('red');
      setTimeout(() => setFaceBorderColor('gray'), 1500);
    }
  };

  /* ------------------ QR Scan ------------------ */
  const handleScan = async data => {
    if (!data) return;
    try {
      const qrText = data.text || data;
      const parsed = JSON.parse(qrText); // ✅ QR has {sessionId, qrToken}

      const res = await api.post('/attendance/mark', {
        userId: loggedUser.userId,
        sessionId: parsed.sessionId,
        qrToken: parsed.qrToken,
      });

      if (res.data.success) {
        setStatus('✅ Attendance marked');
        setQrBorderColor('limegreen');
      } else {
        setStatus('❌ ' + (res.data.error || 'Attendance failed'));
        setQrBorderColor('red');
      }
      setTimeout(() => setQrBorderColor('gray'), 1500);
    } catch (err) {
      console.error('QR scan error:', err);
      setStatus('❌ QR attendance error');
      setQrBorderColor('red');
      setTimeout(() => setQrBorderColor('gray'), 1500);
    }
  };

  /* ------------------ UI ------------------ */
  return (
    <div className="p-4 bg-white rounded-2xl shadow-md">
      <h2 className="text-lg font-bold mb-2">Student Login & Attendance</h2>

      {step === 'face' && (
        <div>
          <p>Step: Verify Face</p>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className="w-full rounded-lg"
            style={{ border: `4px solid ${faceBorderColor}` }}
          />
          <canvas ref={canvasRef} width="320" height="240" hidden />
          <button
            onClick={captureAndVerify}
            className="mt-2 px-4 py-2 bg-blue-500 text-white rounded-lg"
          >
            Capture & Verify
          </button>
        </div>
      )}

      {step === 'qr' && (
        <div>
          <p>Step: Scan Teacher QR to mark attendance</p>
          <QrScanner
            key={qrKey}
            onDecode={handleScan}
            constraints={{ deviceId: selectedCamera ? { exact: selectedCamera } : undefined }}
            style={{ width: '100%', border: `4px solid ${qrBorderColor}` }}
          />
        </div>
      )}

      <p className="mt-2">{status}</p>
    </div>
  );
}

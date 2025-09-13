import React, { useRef, useState, useEffect } from 'react';
import axios from 'axios';
import api from './api';

export default function RegisterPage({ onRedirectToLogin }) {
  const videoRef = useRef(null);
  const [form, setForm] = useState({
    userId: '',
    name: '',
    email: '',
    password: '',
    role: 'student',
  });
  const [captured, setCaptured] = useState(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      videoRef.current.srcObject = stream;
      setCameraActive(true);
    } catch (err) {
      alert('Cannot access camera: ' + err.message);
    }
  };

  const stopCamera = () => {
    const stream = videoRef.current?.srcObject;
    if (stream) stream.getTracks().forEach(track => track.stop());
    videoRef.current.srcObject = null;
    setCameraActive(false);
  };

  const capture = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    canvas.getContext('2d').drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL('image/jpeg');
    setCaptured(data);
    stopCamera();
  };

  const submit = async () => {
    if (!captured) return alert('Capture your face first');
    if (!form.userId || !form.name || !form.password) return alert('Please fill all required fields');

    setLoading(true);
    try {
      const res = await axios.post(`${import.meta.env.VITE_API_BASE_URL}/registerUserLive`, {
        ...form,
        imageBase64: captured,
      });
      setMessage('✅ Registration submitted! Pending admin approval.');
      setForm({ userId: '', name: '', email: '', password: '', role: 'student' });
      setCaptured(null);

      setTimeout(() => {
        setMessage('');
        if (onRedirectToLogin) onRedirectToLogin();
      }, 2000);
    } catch (err) {
      alert('Error: ' + (err?.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => () => stopCamera(), []);

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <h2 style={titleStyle}>Register</h2>
        {message && <p style={messageStyle}>{message}</p>}

        <div style={formGroupStyle}>
          <input placeholder="User ID" value={form.userId} onChange={e => setForm({ ...form, userId: e.target.value })} style={inputStyle} />
          <input placeholder="Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={inputStyle} />
          <input placeholder="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} style={inputStyle} />
          <input type="password" placeholder="Password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} style={inputStyle} />

          <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} style={selectStyle}>
            <option value="student">Student</option>
            <option value="teacher">Teacher</option>
          </select>
        </div>

        <div style={cameraWrapperStyle}>
          <video ref={videoRef} autoPlay playsInline style={videoStyle} />
          <div style={{ marginTop: 10, textAlign: 'center' }}>
            {!cameraActive
              ? <button style={primaryBtnStyle} onClick={startCamera}>Start Camera</button>
              : <button style={primaryBtnStyle} onClick={capture}>Capture Face</button>}
          </div>
        </div>

        {captured && (
          <div style={capturedWrapperStyle}>
            <img src={captured} alt="Captured face" style={capturedImgStyle} />
            <button style={{ ...primaryBtnStyle, marginTop: 8 }} onClick={() => setCaptured(null)}>Retake</button>
          </div>
        )}

        <button style={{ ...primaryBtnStyle, width: '100%', marginTop: 12 }} onClick={submit} disabled={loading}>
          {loading ? 'Submitting...' : 'Submit Registration'}
        </button>
      </div>
    </div>
  );
}

// Styles
const containerStyle = {
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  minHeight: '100vh',
  background: '#f0f2f5',
  padding: 20,
};

const cardStyle = {
  background: '#fff',
  padding: 30,
  borderRadius: 16,
  width: 380,
  boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
  textAlign: 'center',
};

const titleStyle = { marginBottom: 20, color: '#333' };
const messageStyle = { color: 'green', fontWeight: 500, marginBottom: 15 };

const formGroupStyle = { marginBottom: 20 };
const inputStyle = {
  display: 'block',
  width: '100%',
  padding: '10px 12px',
  marginBottom: 12,
  borderRadius: 8,
  border: '1px solid #ccc',
  fontSize: 15,
  outline: 'none',
};
const selectStyle = { ...inputStyle, padding: '10px 12px' };

const cameraWrapperStyle = { textAlign: 'center', marginBottom: 15 };
const videoStyle = { width: '100%', borderRadius: 12, border: '2px solid #ddd' };

const primaryBtnStyle = {
  padding: '10px 18px',
  borderRadius: 8,
  border: 'none',
  background: 'linear-gradient(135deg, #3498db, #2980b9)',
  color: '#fff',
  fontWeight: 500,
  cursor: 'pointer',
  transition: '0.2s',
  minWidth: 140,
};

const capturedWrapperStyle = { textAlign: 'center', marginBottom: 15 };
const capturedImgStyle = { width: 150, borderRadius: 12, border: '2px solid #ccc' };

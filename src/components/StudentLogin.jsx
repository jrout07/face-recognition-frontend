// StudentLogin.js
import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Button, StyleSheet, ActivityIndicator } from 'react-native';
import { Camera, useCameraDevices } from 'react-native-vision-camera';
import { useScanBarcodes, BarcodeFormat } from 'vision-camera-code-scanner';

export default function StudentLogin({ api }) {
  const devices = useCameraDevices();
  const [device, setDevice] = useState(null);
  const [hasPermission, setHasPermission] = useState(false);
  const [step, setStep] = useState('login'); // login -> face -> qr
  const [loggedUser, setLoggedUser] = useState(null);
  const [form, setForm] = useState({ userId: '', password: '' });
  const [status, setStatus] = useState('');
  const [borderColor, setBorderColor] = useState('gray');

  // QR scanner setup
  const [frameProcessor, barcodes] = useScanBarcodes([BarcodeFormat.QR_CODE], { checkInverted: true });

  // Request camera permissions
  useEffect(() => {
    Camera.requestCameraPermission().then(status => setHasPermission(status === 'authorized'));
  }, []);

  // Update device based on step
  useEffect(() => {
    if (!devices) return;
    if (step === 'face') setDevice(devices.front);
    if (step === 'qr') setDevice(devices.back);
  }, [step, devices]);

  // Handle login
  const handleLogin = async () => {
    if (!form.userId || !form.password) return alert('Enter userId and password');
    try {
      const res = await api.post('/login', form);
      if (res.data.success && res.data.role === 'student') {
        setLoggedUser(res.data);
        setStep('face');
        setBorderColor('gray');
        setStatus('Initializing face verification...');
      } else {
        alert(res.data.error || 'Login failed');
      }
    } catch (err) {
      console.error(err);
      alert('Login error: ' + (err.message || 'Unknown error'));
    }
  };

  // Face verification simulation
  useEffect(() => {
    if (step !== 'face') return;
    if (!device) return;

    let timeout;
    // simulate automatic face verification after 2 seconds
    timeout = setTimeout(() => {
      const success = Math.random() > 0.3; // 70% chance success
      if (success) {
        setStatus('✅ Face verified! Moving to QR scan...');
        setBorderColor('limegreen');
        setTimeout(() => setStep('qr'), 1000);
      } else {
        setStatus('❌ Face not matched, retrying...');
        setBorderColor('red');
        setTimeout(() => setBorderColor('gray'), 1000);
        timeout = setTimeout(() => setStep('face'), 1500);
      }
    }, 2000);

    return () => clearTimeout(timeout);
  }, [step, device]);

  // QR scanning
  useEffect(() => {
    if (step !== 'qr') return;
    if (!barcodes || barcodes.length === 0) return;

    const qrText = barcodes[0].displayValue;
    if (!qrText) return;

    const markAttendance = async () => {
      try {
        const res = await api.post('/attendance/mark', {
          userId: loggedUser.userId,
          sessionId: qrText,
        });
        if (res.data.success) {
          setStatus('✅ Attendance marked');
          setBorderColor('limegreen');
        } else {
          setStatus('❌ Attendance failed');
          setBorderColor('red');
        }
        setTimeout(() => setBorderColor('gray'), 1500);
      } catch (err) {
        console.error(err);
        setStatus('❌ QR attendance error');
        setBorderColor('red');
        setTimeout(() => setBorderColor('gray'), 1500);
      }
    };

    markAttendance();
  }, [barcodes]);

  if (step === 'login') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Student Login</Text>
        <TextInput
          placeholder="User ID"
          style={styles.input}
          value={form.userId}
          onChangeText={t => setForm({ ...form, userId: t })}
        />
        <TextInput
          placeholder="Password"
          secureTextEntry
          style={styles.input}
          value={form.password}
          onChangeText={t => setForm({ ...form, password: t })}
        />
        <Button title="Login" onPress={handleLogin} />
      </View>
    );
  }

  if (!device || !hasPermission) {
    return (
      <View style={styles.container}>
        <Text>Camera loading or permission denied</Text>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <Camera
        style={{ flex: 1, borderWidth: 5, borderColor }}
        device={device}
        isActive={true}
        frameProcessor={step === 'qr' ? frameProcessor : undefined}
        frameProcessorFps={5}
      />
      <View style={styles.statusContainer}>
        <Text style={styles.statusText}>{status}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 20 },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  input: { borderWidth: 1, borderColor: '#ccc', padding: 10, borderRadius: 5, marginBottom: 10 },
  statusContainer: {
    position: 'absolute',
    bottom: 20,
    left: 0,
    right: 0,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 10,
    borderRadius: 5,
    marginHorizontal: 20,
  },
  statusText: { color: 'white', fontWeight: 'bold' },
});

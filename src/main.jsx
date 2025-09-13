import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './style.css'; // or index.css if you have one

createRoot(document.getElementById('root')).render(<App />);

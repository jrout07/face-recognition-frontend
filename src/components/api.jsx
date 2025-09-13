// frontend/src/components/api.js
import axios from "axios";

// Create an Axios instance for your backend
const api = axios.create({
  baseURL: "https://face-recognition-attendance-project.onrender.com", // your backend URL
  headers: {
    "Content-Type": "application/json",
  },
});

// Optional: Add interceptors for logging or error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error("API Error:", error.response || error.message);
    return Promise.reject(error);
  }
);

export default api;

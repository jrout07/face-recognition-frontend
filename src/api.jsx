
import axios from "axios";

const API = axios.create({
  baseURL: "https://face-recognition-attendance-project.onrender.com",
});

export default API;

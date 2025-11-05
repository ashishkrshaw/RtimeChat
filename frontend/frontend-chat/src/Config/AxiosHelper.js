import axios from "axios";

// Base URLs for different environments
export const PRODUCTION_URL = "https://wecor.onrender.com";
export const LOCALHOST_URL = "http://localhost:8080";
export const EC2_URL = "https://wecord.duckdns.org"; // HTTPS EC2 backend with DuckDNS domain

// Environment detection and URL selection
const getBaseURL = () => {
  // Check if we're in development mode
  if (import.meta.env.DEV) {
    return LOCALHOST_URL;
  }
  
  // Check for environment variable first (set this in Render dashboard)
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  
  // Check if running on Render (HTTPS required)
  if (window.location.hostname.includes('onrender.com')) {
    // For HTTPS frontend, we need HTTPS backend or use proxy
    // Option 1: Use your backend also deployed on Render
    // return "https://your-backend-service.onrender.com";
    
    // Option 2: Use HTTP backend but this will cause Mixed Content error
    // We'll handle this with environment variable instead
    return EC2_URL;
  }
  
  // Default to EC2 for other deployments
  return EC2_URL;
};

// Determine which URL to use
export const baseURL = getBaseURL();

console.log("🌐 Using backend URL:", baseURL);

// Create axios instances for different environments
export const httpClient = axios.create({
  baseURL: baseURL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  }
});

export const productionClient = axios.create({
  baseURL: PRODUCTION_URL,
});

export const localhostClient = axios.create({
  baseURL: LOCALHOST_URL,
});

export const ec2Client = axios.create({
  baseURL: EC2_URL,
});

// Add request interceptor for debugging
httpClient.interceptors.request.use(
  (config) => {
    console.log(`🚀 API Request: ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    console.error("❌ Request Error:", error);
    return Promise.reject(error);
  }
);

// Add response interceptor for debugging
httpClient.interceptors.response.use(
  (response) => {
    console.log(`✅ API Response: ${response.status} ${response.config.url}`);
    return response;
  },
  (error) => {
    console.error(`❌ API Error: ${error.response?.status} ${error.config?.url}`, error.response?.data);
    return Promise.reject(error);
  }
);
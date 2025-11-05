package com.chat.config;

public class AppConstants {
    // Update this with your actual Render frontend URL
    public static final String RENDER_FRONTEND_URL="https://wecord-s3vw.onrender.com";
    public static final String OLD_FRONTEND_URL="https://wecord-s3vw.onrender.com";
    public static final String LOCALHOST_URL="http://localhost:5173";
    
    // Array of allowed origins for CORS
    public static final String[] ALLOWED_ORIGINS = {
        RENDER_FRONTEND_URL,        // Your new Render frontend URL
        OLD_FRONTEND_URL,           // Keep old URL for backward compatibility
        LOCALHOST_URL,
        "http://localhost:3000",    // In case you use different ports
        "http://localhost:5174",    // Vite sometimes uses this port
        "http://127.0.0.1:5173",    // Alternative localhost format
        "http://127.0.0.1:3000",
        "*"                         // Allow all origins (use with caution in production)
    };

}

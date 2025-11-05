import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import { BrowserRouter } from "react-router";
import AppRoutes from "./Config/routes.jsx";
import { Toaster } from "react-hot-toast";
import { ChatProvider } from "./context/ChatContext";

// ...existing code...

createRoot(document.getElementById("root")).render(

  <BrowserRouter>
    <Toaster position="top-center" />
    <ChatProvider>
      <AppRoutes />
    </ChatProvider>
  </BrowserRouter>

);
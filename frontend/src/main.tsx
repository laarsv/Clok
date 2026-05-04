import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Service Worker registrieren – nur in Production-Builds und unter HTTPS/localhost.
// Vite setzt import.meta.env.PROD bei `vite build` auf true.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      // Im Log sichtbar, blockt aber nichts
      console.warn("Service Worker registration failed:", err);
    });
  });
}

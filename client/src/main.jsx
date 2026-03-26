import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./styles/index.css";
import { registerSW } from "virtual:pwa-register";

const shouldEnablePwa = import.meta.env.VITE_ENABLE_PWA === "true";

if ("serviceWorker" in navigator) {
  if (shouldEnablePwa) {
    registerSW({
      immediate: true,
    });
  } else {
    // Prevent stale service worker caches from causing blank screens after deploys.
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => {
        registration.unregister();
      });
    });

    if ("caches" in window) {
      caches.keys().then((keys) => {
        keys.forEach((key) => {
          caches.delete(key);
        });
      });
    }
  }
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import "./styles/index.css";
import { registerSW } from "virtual:pwa-register";
import { applyTheme, resolveInitialTheme } from "./utils/theme";

const shouldEnablePwa = import.meta.env.VITE_ENABLE_PWA !== "false";
applyTheme(resolveInitialTheme());

if ("serviceWorker" in navigator) {
  if (shouldEnablePwa) {
    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        updateSW(true);
        window.location.reload();
      },
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
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

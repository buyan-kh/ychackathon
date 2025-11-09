import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";
import ErrorBoundary from "@/components/ErrorBoundary";

// Suppress ResizeObserver errors (common in dev mode with dynamic UI)
const resizeObserverLoopErr = /^[^(ResizeObserver loop limit exceeded|ResizeObserver loop completed with undelivered notifications)]/;

// Suppress console errors
const consoleError = console.error;
console.error = (...args) => {
  const firstArg = args[0];
  const message = typeof firstArg === 'string' ? firstArg : firstArg?.toString() || '';
  if (message.includes('ResizeObserver loop') || 
      message.includes('ResizeObserver loop completed') ||
      message.includes('ResizeObserver loop limit exceeded')) {
    return;
  }
  consoleError(...args);
};

// Suppress window errors
const originalErrorHandler = window.onerror;
window.onerror = (message, source, lineno, colno, error) => {
  if (typeof message === 'string' && message.includes('ResizeObserver loop')) {
    return true; // Prevents the error from being logged
  }
  if (originalErrorHandler) {
    return originalErrorHandler(message, source, lineno, colno, error);
  }
  return false;
};

// Suppress unhandled promise rejections related to ResizeObserver
window.addEventListener('unhandledrejection', (event) => {
  if (event.reason && 
      typeof event.reason === 'object' && 
      event.reason.message && 
      event.reason.message.includes('ResizeObserver loop')) {
    event.preventDefault();
  }
});

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);

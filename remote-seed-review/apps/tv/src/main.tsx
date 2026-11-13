import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.js';
import '@fontsource/noto-sans-sinhala/500.css';
import '@fontsource/noto-sans-sinhala/600.css';
import '@fontsource/noto-sans-sinhala/700.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import './index.css';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch((err) => {
      console.warn('TV Service Worker registration failed:', err);
    });
  });
}

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');
ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

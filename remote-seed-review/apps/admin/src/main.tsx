import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.js';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/admin/sw.js', { scope: '/admin/' })
      .catch((err) => {
        console.warn('Admin ServiceWorker registration failed:', err);
      });
  });
}



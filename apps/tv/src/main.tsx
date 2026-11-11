import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.js';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

const app = ReactDOM.createRoot(root);

function render(mockName?: string) {
  app.render(
    <React.StrictMode>
      <App {...(mockName === undefined ? {} : { mockName })} />
    </React.StrictMode>,
  );
}

render();
if (import.meta.env.DEV) {
  void import('./mock/index.js')
    .then(({ loadMockIfRequested }) => loadMockIfRequested())
    .then((schedule) => {
      if (schedule) render(schedule.station.name.en);
    })
    .catch((error: unknown) => console.error('Could not load the development schedule', error));
}

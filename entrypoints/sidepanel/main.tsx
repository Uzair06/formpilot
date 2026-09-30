import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import { setUpPdfWorker } from '@/src/parser/pdf-worker';
import '@/assets/base.css';

setUpPdfWorker();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

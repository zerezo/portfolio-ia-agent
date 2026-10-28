import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { APP_ENV } from './components/EnvBanner.jsx';
import './index.css';

if (APP_ENV === 'development') document.title = `[DEV] ${document.title}`;

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

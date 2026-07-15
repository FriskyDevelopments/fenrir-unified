import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { installHoneybadgerBrowserReporter } from './services/honeybadger';
import './styles/global.css';

installHoneybadgerBrowserReporter();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

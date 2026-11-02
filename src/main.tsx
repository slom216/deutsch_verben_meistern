import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './App';

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root is missing from index.html.');

// Links from the hash-routing era (/#/library/x) keep working.
if (location.hash.startsWith('#/')) history.replaceState(null, '', location.hash.slice(1));

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

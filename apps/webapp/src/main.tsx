import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from '@/App';
import { redirectLegacyBuildLinks } from '@/router';
import './styles.css';

// Before the first render, so a build link shared before the planner moved to
// /builder never paints the front page on its way there.
redirectLegacyBuildLinks();

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

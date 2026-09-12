import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from '@/App';
import './styles.css';

/*
 * There is no legacy-link redirect any more.
 *
 * The old one sent `/#b=<payload>` to the planner, because every board shared
 * before the planner moved off the site root pointed at `/`. Those payloads are
 * codec v1-v6, which v7 refuses outright — so forwarding them would land people
 * on an editor that reports a broken link rather than on a list of builds. The
 * browse page is the better answer to a link that cannot be read.
 */

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

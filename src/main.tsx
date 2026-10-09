import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './app.tsx';
import { StandaloneGame } from './standalone-game.tsx';

createRoot(document.getElementById('root')!).render(
    <StrictMode>{import.meta.env.VITE_GAME_ONLY === 'true' ? <StandaloneGame /> : <App />}</StrictMode>
);

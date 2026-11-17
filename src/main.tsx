import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { warmupPhotoIndexedDbCache } from './services/photoIndexedDbCache';

void warmupPhotoIndexedDbCache();

createRoot(document.getElementById('root')!).render(<App />);

// Registro do Service Worker para PWA e suporte offline com escopo compatível com GitHub Pages
if ('serviceWorker' in navigator && typeof window !== 'undefined') {
  window.addEventListener('load', () => {
    const baseUrl = import.meta.env.BASE_URL || '/';
    const swUrl = `${baseUrl}sw.js`;

    navigator.serviceWorker
      .register(swUrl, { scope: baseUrl, updateViaCache: 'imports' })
      .then((registration) => {
        registration.onupdatefound = () => {
          const installingWorker = registration.installing;
          if (installingWorker) {
            installingWorker.onstatechange = () => {
              if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                console.log('Nova versão do Lista Piloto 2027 pronta para uso offline.');
              }
            };
          }
        };
      })
      .catch((err) => {
        console.warn('Registro de Service Worker PWA:', err);
      });
  });
}


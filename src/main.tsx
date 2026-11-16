import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(<App />);

// Verificação de disponibilidade dos ícones antes da inicialização do Service Worker
const verifyIconAssets = async (base: string): Promise<boolean> => {
  const iconsToCheck = [
    `${base}favicon.svg`,
    `${base}pwa-192x192.png`,
    `${base}apple-touch-icon.png`,
  ];

  try {
    const results = await Promise.all(
      iconsToCheck.map(async (url) => {
        try {
          const res = await fetch(url, { method: 'HEAD' });
          if (res.ok) return true;
          if (res.status === 405) {
            const getRes = await fetch(url);
            return getRes.ok;
          }
          return false;
        } catch {
          return false;
        }
      })
    );
    return results.every(Boolean);
  } catch {
    return false;
  }
};

// Registro do Service Worker para PWA e suporte offline com validação prévia de ícones
if ('serviceWorker' in navigator && typeof window !== 'undefined') {
  window.addEventListener('load', async () => {
    const baseUrl = import.meta.env.BASE_URL || '/';
    const swUrl = `${baseUrl}sw.js`;

    // Verifica se os arquivos de ícones essenciais estão acessíveis antes de registrar
    const iconsReady = await verifyIconAssets(baseUrl);
    if (!iconsReady) {
      console.warn('Registro do Service Worker ignorado: arquivos de ícones (favicon.svg, etc.) não estão acessíveis.');
      return;
    }

    navigator.serviceWorker
      .register(swUrl)
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


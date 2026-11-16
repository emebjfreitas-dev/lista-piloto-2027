import React from 'react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { WifiOff } from 'lucide-react';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-16 sm:bottom-6 left-4 z-50 flex items-center gap-2.5 rounded-2xl bg-amber-600 px-3.5 py-2 text-xs font-bold text-white shadow-lg animate-gentle-fade border border-amber-500/80"
    >
      <WifiOff className="w-4 h-4 shrink-0 animate-pulse text-amber-100" />
      <span>Modo Offline Ativo — Os dados locais continuam salvos e acessíveis.</span>
    </div>
  );
};

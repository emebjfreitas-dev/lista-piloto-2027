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
      className="fixed bottom-16 sm:bottom-6 left-4 z-50 flex items-center gap-2.5 rounded-2xl bg-amber-800 px-4 py-2.5 text-xs font-bold text-white shadow-[0_14px_34px_rgba(2,6,23,0.4)] animate-gentle-fade"
    >
      <WifiOff className="w-4 h-4 shrink-0 text-amber-100" />
      <span>Modo Offline Ativo — Os dados locais continuam salvos e acessíveis.</span>
    </div>
  );
};

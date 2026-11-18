import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Download, Smartphone, X } from 'lucide-react';

export const PWAInstallButton: React.FC<{ variant?: 'header' | 'menu' }> = ({ variant = 'header' }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);

  // Se já estiver rodando instalado como PWA, oculta o botão
  if (isInstalled) {
    return null;
  }

  const handleInstallClick = async () => {
    setIsInstalling(true);
    try {
      await install();
    } finally {
      setIsInstalling(false);
    }
  };

  // Botão em menu lateral ou dropdown do perfil
  if (variant === 'menu') {
    if (isInstallable) {
      return (
        <button
          type="button"
          onClick={handleInstallClick}
          disabled={isInstalling}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer text-left"
        >
          <Download className="w-4 h-4 text-[#0b3b8c]" />
          <span>Instalar Aplicativo (PWA)</span>
        </button>
      );
    }

    if (isIOS) {
      return (
        <>
          <button
            type="button"
            onClick={() => setShowIOSGuide(true)}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer text-left"
          >
            <Smartphone className="w-4 h-4 text-[#0b3b8c]" />
            <span>Instalar no iPhone / iPad</span>
          </button>

          {showIOSGuide && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-gentle-fade"
              onClick={() => setShowIOSGuide(false)}
            >
              <div
                className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl space-y-4"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <Smartphone className="w-5 h-5 text-[#0b3b8c]" />
                    <h3 className="text-sm font-bold text-slate-900">Instalar no iPhone / iPad</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowIOSGuide(false)}
                    className="p-1 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="space-y-2 text-xs text-slate-700 leading-relaxed">
                  <p className="flex items-start gap-2">
                    <span className="font-bold text-[#0b3b8c] shrink-0">1.</span>
                    <span>No navegador <strong>Safari</strong>, toque no botão <strong>Compartilhar</strong> (ícone de quadrado com seta para cima).</span>
                  </p>
                  <p className="flex items-start gap-2">
                    <span className="font-bold text-[#0b3b8c] shrink-0">2.</span>
                    <span>Role para baixo e selecione <strong>&ldquo;Adicionar à Tela de Início&rdquo;</strong>.</span>
                  </p>
                  <p className="flex items-start gap-2">
                    <span className="font-bold text-[#0b3b8c] shrink-0">3.</span>
                    <span>Toque em <strong>&ldquo;Adicionar&rdquo;</strong> no canto superior direito para fixar o ícone oficial.</span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="w-full py-2.5 rounded-xl bg-[#0b3b8c] hover:bg-[#082d6b] text-white text-xs font-bold transition-colors cursor-pointer"
                >
                  Entendi
                </button>
              </div>
            </div>
          )}
        </>
      );
    }

    return null;
  }

  // Botão no Header
  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={handleInstallClick}
        disabled={isInstalling}
        title="Instalar Lista Piloto como aplicativo no seu dispositivo"
        className="h-9 px-3 rounded-lg bg-[#0b3b8c]/[0.07] hover:bg-[#0b3b8c]/[0.12] border border-[#0b3b8c]/20 text-[#0b3b8c] font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
      >
        <Download className="w-4 h-4 stroke-[2]" />
        <span className="hidden sm:inline">Instalar App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          title="Instalar no iPhone / iPad"
          className="h-9 px-3 rounded-lg border border-slate-200/90 bg-white hover:bg-slate-50 text-slate-700 font-medium text-xs flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          <Smartphone className="w-4 h-4 text-slate-600" />
          <span className="hidden sm:inline">Instalar iOS</span>
        </button>

        {showIOSGuide && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-gentle-fade"
            onClick={() => setShowIOSGuide(false)}
          >
            <div
              className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl space-y-4 text-left"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Smartphone className="w-5 h-5 text-[#0b3b8c]" />
                  <h3 className="text-sm font-bold text-slate-900">Instalar no iPhone / iPad</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-2 text-xs text-slate-700 leading-relaxed">
                <p className="flex items-start gap-2">
                  <span className="font-bold text-[#0b3b8c] shrink-0">1.</span>
                  <span>No <strong>Safari</strong>, toque no ícone <strong>Compartilhar</strong> (quadrado com seta para cima).</span>
                </p>
                <p className="flex items-start gap-2">
                  <span className="font-bold text-[#0b3b8c] shrink-0">2.</span>
                  <span>Role as opções e toque em <strong>&ldquo;Adicionar à Tela de Início&rdquo;</strong>.</span>
                </p>
                <p className="flex items-start gap-2">
                  <span className="font-bold text-[#0b3b8c] shrink-0">3.</span>
                  <span>Confirme tocando em <strong>&ldquo;Adicionar&rdquo;</strong> para abrir em tela cheia como aplicativo.</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full py-2.5 rounded-xl bg-[#0b3b8c] hover:bg-[#082d6b] text-white text-xs font-bold transition-colors cursor-pointer"
              >
                Entendi
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};

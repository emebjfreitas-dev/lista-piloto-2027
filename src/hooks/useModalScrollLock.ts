import { useEffect } from 'react';

/**
 * useModalScrollLock:
 * Bloqueia a rolagem do elemento body quando o modal está aberto,
 * prevenindo o "scroll chaining" (rolagem indesejada da página de fundo),
 * compensando o padding do scrollbar para evitar saltos de layout no desktop
 * e liberando a rolagem nativa suave imediatamente ao fechar.
 */
export function useModalScrollLock(isOpen: boolean) {
  useEffect(() => {
    if (!isOpen) return;

    const originalOverflow = document.body.style.overflow;
    const originalPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
    document.body.classList.add('modal-open');

    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.paddingRight = originalPaddingRight;
      document.body.classList.remove('modal-open');
    };
  }, [isOpen]);
}

import React from 'react';
import { createPortal } from 'react-dom';

interface ModalPortalProps {
  children: React.ReactNode;
}

/**
 * Renderiza overlays e modais diretamente em document.body, evitando que
 * containers animados (transform / will-change) ou com overflow aprisionem
 * elementos position: fixed atrás de Header/BottomNav ou desalinhados no scroll.
 */
export const ModalPortal: React.FC<ModalPortalProps> = ({ children }) => {
  if (typeof document === 'undefined' || !document.body) {
    return null;
  }
  return createPortal(children, document.body);
};

export type AppFontId =
  | 'inter'
  | 'manrope'
  | 'dm-sans'
  | 'plus-jakarta'
  | 'ibm-plex';

export interface AppFontOption {
  id: AppFontId;
  name: string;
  shortLabel: string;
  cssFamily: string;
  description: string;
  badge?: string;
}

export const APP_FONT_STORAGE_KEY = 'emeb_candelario_font_family_2027';

export const APP_FONT_OPTIONS: AppFontOption[] = [
  {
    id: 'inter',
    name: 'Inter',
    shortLabel: 'Inter',
    cssFamily: '"Inter", sans-serif',
    description:
      'Minha primeira escolha. Muito legível, limpa e funciona muito bem em inputs, labels e botões.',
    badge: '1ª Escolha',
  },
  {
    id: 'manrope',
    name: 'Manrope',
    shortLabel: 'Manrope',
    cssFamily: '"Manrope", sans-serif',
    description:
      'Mais moderna e com personalidade, ótima para interfaces sofisticadas.',
  },
  {
    id: 'dm-sans',
    name: 'DM Sans',
    shortLabel: 'DM Sans',
    cssFamily: '"DM Sans", sans-serif',
    description:
      'Equilibrada e amigável, boa para dashboards e formulários.',
  },
  {
    id: 'plus-jakarta',
    name: 'Plus Jakarta Sans',
    shortLabel: 'Plus Jakarta',
    cssFamily: '"Plus Jakarta Sans", sans-serif',
    description:
      'Visual contemporâneo, excelente para UI.',
  },
  {
    id: 'ibm-plex',
    name: 'IBM Plex Sans',
    shortLabel: 'IBM Plex',
    cssFamily: '"IBM Plex Sans", sans-serif',
    description:
      'Mais técnica/profissional, ótima para sistemas corporativos.',
  },
];

export const getSavedAppFont = (): AppFontId => {
  try {
    const saved = localStorage.getItem(APP_FONT_STORAGE_KEY) as AppFontId | null;
    if (saved && APP_FONT_OPTIONS.some((f) => f.id === saved)) {
      return saved;
    }
  } catch {
    // ignore
  }
  return 'inter';
};

export const applyAppFont = (fontId: AppFontId): void => {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-font', fontId);
  }
  try {
    localStorage.setItem(APP_FONT_STORAGE_KEY, fontId);
  } catch {
    // ignore
  }
};

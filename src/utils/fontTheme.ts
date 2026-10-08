export type AppFontId = 'manrope';

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
    id: 'manrope',
    name: 'Manrope',
    shortLabel: 'Manrope',
    cssFamily: '"Manrope", sans-serif',
    description:
      'Moderna e com personalidade, oficial em todo o projeto.',
  },
];

export const getSavedAppFont = (): AppFontId => {
  return 'manrope';
};

export const applyAppFont = (_fontId?: AppFontId): void => {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-font', 'manrope');
  }
};

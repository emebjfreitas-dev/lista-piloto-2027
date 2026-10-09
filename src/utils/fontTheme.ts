export type AppFontId = 'apple_sf';

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
    id: 'apple_sf',
    name: 'Apple SF Pro',
    shortLabel: 'SF Pro',
    cssFamily:
      '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, "Inter", sans-serif',
    description:
      'Tipografia idêntica ao site oficial da Apple (SF Pro Text & SF Pro Display).',
  },
];

export const getSavedAppFont = (): AppFontId => {
  return 'apple_sf';
};

export const applyAppFont = (_fontId?: AppFontId): void => {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-font', 'apple_sf');
  }
};

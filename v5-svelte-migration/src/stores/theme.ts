import { writable } from 'svelte/store';

export type ThemeId = 'theme-default';

export type ThemeDefinition = {
  id: ThemeId;
  name: string;
  displayName: string;
  pair: string;
  mood: string;
  liquidLabel: string;
  surfaceMode: 'light';
  primary: string;
  secondary: string;
  accent: string;
  bg: string;
  bgRgb: string;
  surface: string;
  ink: string;
  text: string;
  textSoft: string;
  buttonText: string;
  shadowRgb: string;
  glowPrimaryRgb: string;
  glowSecondaryRgb: string;
};

export const DEFAULT_THEME_ID: ThemeId = 'theme-default';

export const CLAUDE_THEME: ThemeDefinition = {
  id: DEFAULT_THEME_ID,
  name: 'Claude Paper',
  displayName: 'Claude 暖白',
  pair: '纸面 / 陶土',
  mood: '暖白纸面、陶土强调、细线分层。',
  liquidLabel: 'Claude',
  surfaceMode: 'light',
  primary: '#CC785C',
  secondary: '#D4A27F',
  accent: '#E3DFD3',
  bg: '#F0EEE6',
  bgRgb: '240, 238, 230',
  surface: '#FAF9F5',
  ink: '#191919',
  text: '#191919',
  textSoft: '#6B6862',
  buttonText: '#F0EEE6',
  shadowRgb: '25, 25, 25',
  glowPrimaryRgb: '204, 120, 92',
  glowSecondaryRgb: '212, 162, 127'
};

export const themeCatalog: ThemeDefinition[] = [CLAUDE_THEME];
export const activeTheme = writable<ThemeId>(DEFAULT_THEME_ID);

export function getThemeDefinition(_themeId: string | null | undefined): ThemeDefinition {
  return CLAUDE_THEME;
}

export function syncThemeSurfaceMode(root: HTMLElement, theme: ThemeDefinition) {
  root.classList.remove('dark');
  root.style.colorScheme = theme.surfaceMode;
}

export function applyTheme(_themeId: string | null | undefined = DEFAULT_THEME_ID) {
  if (typeof document === 'undefined') {
    activeTheme.set(DEFAULT_THEME_ID);
    return CLAUDE_THEME;
  }

  const theme = CLAUDE_THEME;
  const root = document.documentElement;

  syncThemeSurfaceMode(root, theme);
  root.setAttribute('data-theme', theme.id);
  root.style.setProperty('--paper', theme.bg);
  root.style.setProperty('--surface', theme.surface);
  root.style.setProperty('--ink', theme.ink);
  root.style.setProperty('--ink-soft', theme.textSoft);
  root.style.setProperty('--clay', theme.primary);
  root.style.setProperty('--clay-light', theme.secondary);
  root.style.setProperty('--hairline', theme.accent);
  root.style.setProperty('--hairline-strong', '#D8D3C5');
  root.style.setProperty('--color-primary', theme.primary);
  root.style.setProperty('--color-secondary', theme.secondary);
  root.style.setProperty('--color-accent', theme.accent);
  root.style.setProperty('--color-bg', theme.bg);
  root.style.setProperty('--color-bg-rgb', theme.bgRgb);
  root.style.setProperty('--color-surface', theme.surface);
  root.style.setProperty('--color-text', theme.text);
  root.style.setProperty('--color-text-soft', theme.textSoft);
  root.style.setProperty('--color-button-text', theme.buttonText);
  root.style.setProperty('--shadow-rgb', theme.shadowRgb);
  root.style.setProperty('--glow-primary-rgb', theme.glowPrimaryRgb);
  root.style.setProperty('--glow-secondary-rgb', theme.glowSecondaryRgb);

  activeTheme.set(theme.id);
  return theme;
}

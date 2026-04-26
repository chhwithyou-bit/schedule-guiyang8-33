import { writable } from 'svelte/store';

export type ThemeId = 'theme-default' | 'theme-spring' | 'theme-summer' | 'theme-autumn';

export type ThemeDefinition = {
  id: ThemeId;
  name: string;
  displayName: string;
  pair: string;
  mood: string;
  liquidLabel: string;
  surfaceMode: 'dark' | 'light';
  primary: string;
  secondary: string;
  accent: string;
  bg: string;
  bgRgb: string;
  text: string;
  textSoft: string;
  buttonText: string;
  shadowRgb: string;
  glowPrimaryRgb: string;
  glowSecondaryRgb: string;
};

export const DEFAULT_THEME_ID: ThemeId = 'theme-default';

export const themeCatalog: ThemeDefinition[] = [
  {
    id: 'theme-default',
    name: '烟玫黑茶',
    displayName: '烟玫黑茶',
    pair: '烟玫 × 苔青',
    mood: '黑茶底色收住玫瑰粉，只在按钮和光晕里露一点暖。',
    liquidLabel: '烟玫',
    surfaceMode: 'dark',
    primary: '#D9B29C',
    secondary: '#8AA199',
    accent: '#3A3034',
    bg: '#171418',
    bgRgb: '23, 20, 24',
    text: '#F6ECE3',
    textSoft: 'rgba(246, 236, 227, 0.72)',
    buttonText: '#1E1716',
    shadowRgb: '13, 10, 12',
    glowPrimaryRgb: '217, 178, 156',
    glowSecondaryRgb: '138, 161, 153'
  },
  {
    id: 'theme-spring',
    name: '苔石青岚',
    displayName: '苔石青岚',
    pair: '苔石 × 雾蓝',
    mood: '青绿降到灰阶里，像湿润石面上的一层轻雾。',
    liquidLabel: '苔石',
    surfaceMode: 'dark',
    primary: '#A8BDA9',
    secondary: '#6F8F96',
    accent: '#283C39',
    bg: '#111D1C',
    bgRgb: '17, 29, 28',
    text: '#EEF5EE',
    textSoft: 'rgba(238, 245, 238, 0.72)',
    buttonText: '#111D1C',
    shadowRgb: '9, 18, 17',
    glowPrimaryRgb: '168, 189, 169',
    glowSecondaryRgb: '111, 143, 150'
  },
  {
    id: 'theme-summer',
    name: '雾蓝沉香',
    displayName: '雾蓝沉香',
    pair: '雾蓝 × 沉香',
    mood: '冷雾蓝做主，沉香灰褐只当边缘温度，轻但不飘。',
    liquidLabel: '雾蓝',
    surfaceMode: 'dark',
    primary: '#B7C5D8',
    secondary: '#B69E8C',
    accent: '#2E3542',
    bg: '#151A22',
    bgRgb: '21, 26, 34',
    text: '#F0F4F8',
    textSoft: 'rgba(240, 244, 248, 0.72)',
    buttonText: '#151A22',
    shadowRgb: '10, 13, 18',
    glowPrimaryRgb: '183, 197, 216',
    glowSecondaryRgb: '182, 158, 140'
  },
  {
    id: 'theme-autumn',
    name: '乌木琥珀',
    displayName: '乌木琥珀',
    pair: '琥珀 × 苔橄',
    mood: '乌木背景里留一束琥珀光，橄榄色负责把热度压稳。',
    liquidLabel: '琥珀',
    surfaceMode: 'dark',
    primary: '#CFA36E',
    secondary: '#78886E',
    accent: '#3B3027',
    bg: '#1B1612',
    bgRgb: '27, 22, 18',
    text: '#F7EFE4',
    textSoft: 'rgba(247, 239, 228, 0.72)',
    buttonText: '#1B1612',
    shadowRgb: '14, 10, 7',
    glowPrimaryRgb: '207, 163, 110',
    glowSecondaryRgb: '120, 136, 110'
  }
];

export const activeTheme = writable<ThemeId>(DEFAULT_THEME_ID);

export function getThemeDefinition(themeId: string | null | undefined): ThemeDefinition {
  return themeCatalog.find((theme) => theme.id === themeId) || themeCatalog[0];
}

export function syncThemeSurfaceMode(root: HTMLElement, theme: ThemeDefinition) {
  const isDark = theme.surfaceMode === 'dark';
  root.classList.toggle('dark', isDark);
  root.style.colorScheme = theme.surfaceMode;
}

export function applyTheme(themeId: string | null | undefined) {
  const theme = getThemeDefinition(themeId);
  const root = document.documentElement;

  syncThemeSurfaceMode(root, theme);
  root.setAttribute('data-theme', theme.id);
  root.style.setProperty('--color-primary', theme.primary);
  root.style.setProperty('--color-secondary', theme.secondary);
  root.style.setProperty('--color-accent', theme.accent);
  root.style.setProperty('--color-bg', theme.bg);
  root.style.setProperty('--color-bg-rgb', theme.bgRgb);
  root.style.setProperty('--color-text', theme.text);
  root.style.setProperty('--color-text-soft', theme.textSoft);
  root.style.setProperty('--color-button-text', theme.buttonText);
  root.style.setProperty('--shadow-rgb', theme.shadowRgb);
  root.style.setProperty('--glow-primary-rgb', theme.glowPrimaryRgb);
  root.style.setProperty('--glow-secondary-rgb', theme.glowSecondaryRgb);

  activeTheme.set(theme.id);

  return theme;
}

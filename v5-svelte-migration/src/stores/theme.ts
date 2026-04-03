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
    name: '烟墨十样',
    displayName: '烟墨十样',
    pair: '烟墨色 × 十样锦',
    mood: '烟灰夜色里带一点桃粉的温度，收得住，也有余韵。',
    liquidLabel: '烟墨',
    surfaceMode: 'dark',
    primary: '#FAC7B7',
    secondary: '#F2D3C7',
    accent: '#5D4F57',
    bg: '#231B22',
    bgRgb: '35, 27, 34',
    text: '#FFF4ED',
    textSoft: 'rgba(255, 244, 237, 0.7)',
    buttonText: '#231B22',
    shadowRgb: '63, 46, 55',
    glowPrimaryRgb: '250, 199, 183',
    glowSecondaryRgb: '93, 79, 87'
  },
  {
    id: 'theme-spring',
    name: '若竹秋波',
    displayName: '若竹秋波',
    pair: '若竹 × 秋波蓝',
    mood: '竹青压着冷蓝，干净、松弛，但骨架还是稳的。',
    liquidLabel: '若竹',
    surfaceMode: 'dark',
    primary: '#5DA984',
    secondary: '#8AB9DB',
    accent: '#75C1A6',
    bg: '#173C39',
    bgRgb: '23, 60, 57',
    text: '#ECFAF4',
    textSoft: 'rgba(236, 250, 244, 0.72)',
    buttonText: '#173C39',
    shadowRgb: '19, 54, 50',
    glowPrimaryRgb: '93, 169, 132',
    glowSecondaryRgb: '138, 185, 219'
  },
  {
    id: 'theme-summer',
    name: '西子退红',
    displayName: '西子退红',
    pair: '西子 × 退红',
    mood: '雾青和浅粉贴在一起，轻，但不是没力量。',
    liquidLabel: '西子',
    surfaceMode: 'dark',
    primary: '#F0CFE9',
    secondary: '#87C0CB',
    accent: '#9DD4DD',
    bg: '#283E48',
    bgRgb: '40, 62, 72',
    text: '#FFF5FC',
    textSoft: 'rgba(255, 245, 252, 0.74)',
    buttonText: '#283E48',
    shadowRgb: '31, 47, 57',
    glowPrimaryRgb: '240, 207, 233',
    glowSecondaryRgb: '135, 192, 203'
  },
  {
    id: 'theme-autumn',
    name: '青绿凌霄',
    displayName: '青绿凌霄',
    pair: '青绿 × 凌霄',
    mood: '深青托着橙焰，劲头更足，打开就更有推力。',
    liquidLabel: '青绿',
    surfaceMode: 'dark',
    primary: '#ED863F',
    secondary: '#215A53',
    accent: '#F3B168',
    bg: '#163734',
    bgRgb: '22, 55, 52',
    text: '#FFF2E6',
    textSoft: 'rgba(255, 242, 230, 0.74)',
    buttonText: '#163734',
    shadowRgb: '17, 42, 41',
    glowPrimaryRgb: '237, 134, 63',
    glowSecondaryRgb: '33, 90, 83'
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

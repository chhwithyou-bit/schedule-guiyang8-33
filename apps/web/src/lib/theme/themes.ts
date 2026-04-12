export const THEME_STORAGE_KEY = 'siteTheme';
export const DEFAULT_THEME_ID = 'theme-default';

export type ThemeId =
  | 'theme-default'
  | 'theme-spring'
  | 'theme-summer'
  | 'theme-autumn'
  | 'theme-winter';

export const themeCatalog = [
  {
    id: 'theme-default',
    displayName: '熔岩橘',
    pair: 'amber / blue',
    mood: '经典暖光',
    primary: '#f97316',
    secondary: '#60a5fa',
    dark: true
  },
  {
    id: 'theme-spring',
    displayName: '薄荷春雾',
    pair: 'mint / sky',
    mood: '清亮柔和',
    primary: '#34d399',
    secondary: '#38bdf8',
    dark: false
  },
  {
    id: 'theme-summer',
    displayName: '海盐夏日',
    pair: 'teal / cyan',
    mood: '高饱和流体',
    primary: '#14b8a6',
    secondary: '#22d3ee',
    dark: true
  },
  {
    id: 'theme-autumn',
    displayName: '枫糖暮色',
    pair: 'orange / rose',
    mood: '偏暖玻璃感',
    primary: '#fb923c',
    secondary: '#f472b6',
    dark: true
  },
  {
    id: 'theme-winter',
    displayName: '霜夜蓝银',
    pair: 'indigo / violet',
    mood: '冷色霓光',
    primary: '#818cf8',
    secondary: '#c084fc',
    dark: true
  }
] as const;

function hexToRgbTriplet(hex: string) {
  const cleaned = hex.replace('#', '');
  const normalized = cleaned.length === 3 ? cleaned.split('').map((char) => char + char).join('') : cleaned;
  const value = Number.parseInt(normalized, 16);
  return `${(value >> 16) & 255} ${(value >> 8) & 255} ${value & 255}`;
}

export function readStoredTheme(): ThemeId {
  if (typeof window === 'undefined') return DEFAULT_THEME_ID;
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY) as ThemeId | null;
  return themeCatalog.some((theme) => theme.id === stored) ? (stored as ThemeId) : DEFAULT_THEME_ID;
}

export function applyTheme(themeId: ThemeId) {
  if (typeof document === 'undefined') return;
  const theme = themeCatalog.find((item) => item.id === themeId) ?? themeCatalog[0];
  const root = document.documentElement;
  root.dataset.theme = theme.id;
  root.classList.toggle('dark', theme.dark);
  root.style.colorScheme = theme.dark ? 'dark' : 'light';
  root.style.setProperty('--color-primary', theme.primary);
  root.style.setProperty('--glow-primary-rgb', hexToRgbTriplet(theme.primary));
  root.style.setProperty('--glow-secondary-rgb', hexToRgbTriplet(theme.secondary));
}

export function persistTheme(themeId: ThemeId) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(THEME_STORAGE_KEY, themeId);
}

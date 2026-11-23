// Settings → Theme (port of applyTheme / initTheme in web/app.js). "system" removes data-theme so the CSS media
// query decides; the theme-color metas follow the choice. The key is read early by the inline script in index.html.

export const THEMES = ['system', 'light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

const KEY = 'foodies.theme';
const COLORS = { light: '#fffdf7', dark: '#17151f' }; // --bg in styles.css

export function getTheme(): Theme {
  try {
    const t = localStorage.getItem(KEY);
    return THEMES.includes(t as Theme) ? (t as Theme) : 'system';
  } catch {
    return 'system';
  }
}

export function applyTheme(theme: Theme) {
  if (theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
    meta.content = COLORS[theme === 'system' ? (meta.media.includes('dark') ? 'dark' : 'light') : theme];
  });
}

export function saveTheme(theme: Theme) {
  try {
    if (theme === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch {
    // Storage blocked: the choice lasts only for this page load.
  }
  applyTheme(theme);
}

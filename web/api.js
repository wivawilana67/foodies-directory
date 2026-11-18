// Backend calls and on-device storage. The backend URL and token are entered on each phone and
// stored only in this browser; they never go into the repo.

// The test copy of the app lives under /test/ on the same site; it keeps its own settings and cache.
// The theme key is shared: the inline script in index.html reads it before the modules load.
export const IS_TEST = location.pathname.includes('/test/');
const PREFIX = IS_TEST ? 'foodies-test.' : 'foodies.';
const KEYS = { url: `${PREFIX}backendUrl`, token: `${PREFIX}token`, cache: `${PREFIX}cache`, theme: 'foodies.theme' };
const BACKEND_PATTERN = /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/;

function read(key) {
  try {
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function getSettings() {
  return { url: read(KEYS.url), token: read(KEYS.token) };
}

export function saveSettings(url, token) {
  if (!BACKEND_PATTERN.test(url)) throw new Error('The backend URL must look like https://script.google.com/macros/s/…/exec');
  if (token.length < 16) throw new Error('The token looks too short');
  if (!write(KEYS.url, url) || !write(KEYS.token, token)) throw new Error('This browser blocked saving settings');
}

const THEMES = ['system', 'light', 'dark'];

export function getTheme() {
  const theme = read(KEYS.theme);
  return THEMES.includes(theme) ? theme : 'system';
}

export function saveTheme(theme) {
  if (THEMES.includes(theme)) write(KEYS.theme, theme);
}

// Last `list` response {places, dishes, options, people}; missing parts are filled in by the caller.
export function readCache() {
  try {
    return JSON.parse(read(KEYS.cache)) || {};
  } catch {
    return {};
  }
}

export function writeCache(data) {
  write(KEYS.cache, JSON.stringify(data));
}

// text/plain keeps this a "simple" request: no CORS preflight, which Apps Script cannot answer.
export async function call(action, data = {}) {
  const { url, token } = getSettings();
  if (!url || !token) throw new Error('Set the backend URL and token first');
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ ...data, action, token }),
  });
  if (!res.ok) throw new Error(`Backend error ${res.status}`);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Request failed');
  return json;
}

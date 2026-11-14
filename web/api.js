// Backend calls and on-device storage. The backend URL and token are entered on each phone and
// stored only in this browser; they never go into the repo.

const KEYS = { url: 'foodies.backendUrl', token: 'foodies.token', cache: 'foodies.cache' };
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

export function readCache() {
  try {
    return JSON.parse(read(KEYS.cache)) || { places: [], fields: [] };
  } catch {
    return { places: [], fields: [] };
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

// API calls and on-device storage. The app token and the offline copy of /api/bootstrap live only in this
// browser's localStorage; every access is wrapped in try/catch (private browsing can block storage).
import type { Data, Place } from './types';

const KEYS = { token: 'foodies.token', cache: 'foodies.cache' };

function read(key: string): string {
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

function write(key: string, value: string) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    // Storage blocked: the value lasts only for this page load.
  }
}

let token = read(KEYS.token);
export const hasToken = () => Boolean(token);

export function setToken(value: string) {
  token = value;
  write(KEYS.token, value);
}

// Last bootstrap reply, for an instant start and for offline use.
export function readCache(): Data | null {
  try {
    const data = JSON.parse(read(KEYS.cache));
    return Array.isArray(data?.places) ? data : null;
  } catch {
    return null;
  }
}

export const writeCache = (data: Data | null) => write(KEYS.cache, data ? JSON.stringify(data) : '');

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

// Relative /api paths work behind Firebase Hosting and the Vite dev proxy alike. Throws ApiError with the
// server's message (safe to show); status 0 means the server could not be reached.
export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('Could not reach the server. Check your connection.', 0);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) throw new ApiError(data.error ?? `Server error ${response.status}`, response.status);
  return data as T;
}

// Edits a place: only changed fields and ratings ({personId: {score?, review?}}), with the version the phone
// loaded. The API answers 409 when the place changed since then (D24).
export const patchPlace = (place: Place, changes: object, ratings?: object) =>
  api<{ place: Place }>(`/api/places/${place.id}`, 'PATCH', { version: place.version, changes, ratings }).then((r) => r.place);

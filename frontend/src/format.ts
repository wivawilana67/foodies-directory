// Formatting helpers ported from web/ui.js and web/geo.js. Location stays on the phone: distances are
// computed here and coordinates are never sent to the API.
import type { Place } from './types';

export type Coords = { lat: number; lng: number };

export const text = (v: unknown) => String(v ?? '').trim();
export const httpsUrl = (v: unknown) => (/^https:\/\//.test(text(v)) ? text(v) : '');
export const areaOf = (p: Place) => [p.district, p.city].map(text).filter(Boolean).join(', ');
export const locationOf = (p: Place) =>
  [p.landmark, p.district, p.city, p.country].map(text).filter(Boolean).join(', ');
export const unique = (list: unknown[]) =>
  [...new Set(list.map(text).filter(Boolean))].sort((a, b) => a.localeCompare(b));
export const coordsOf = (p: Place): Coords | null => (p.lat !== null && p.lng !== null ? { lat: p.lat, lng: p.lng } : null);

export const formatKm = (d: number) => (d < 1 ? `${Math.round(d * 1000)} m` : `${d.toFixed(d < 10 ? 1 : 0)} km`);

export function mapsHref(p: Place) {
  const link = httpsUrl(p.mapsLink);
  if (link) return link;
  const params = new URLSearchParams({ api: '1', query: [p.name, p.city, p.country].map(text).filter(Boolean).join(' ') });
  if (p.placeId) params.set('query_place_id', p.placeId);
  return `https://www.google.com/maps/search/?${params}`;
}

// Name, location and Google Maps link on three lines, ready to paste into a chat.
export const placeText = (p: Place) => [text(p.name), locationOf(p), mapsHref(p)].filter(Boolean).join('\n');

// Average of the people's score ranks; a rank is the position in the Master rating list (last = best), 0 if none.
export function averageRank(p: Place, ratings: string[]) {
  const ranks = Object.values(p.ratings).map((r) => ratings.indexOf(text(r.score)) + 1).filter(Boolean);
  return ranks.length ? ranks.reduce((a, b) => a + b) / ranks.length : 0;
}

export function distanceKm(a: Coords, b: Coords) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

export function getPosition(): Promise<Coords> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('not supported on this browser'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      (err) => reject(new Error(err.message)),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  });
}

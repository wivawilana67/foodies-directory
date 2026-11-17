// Shared DOM, formatting and navigation helpers. Place text goes into the page with textContent only.

export const $ = (id) => document.getElementById(id);

export function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((c) => c !== null && c !== undefined && c !== '' && c !== false));
  return node;
}

export const text = (v) => String(v ?? '').trim();
export const httpsUrl = (v) => (/^https:\/\//.test(text(v)) ? text(v) : '');
export const areaOf = (p) => [p.district, p.city].map(text).filter(Boolean).join(', ');
export const locationOf = (p) => [p.landmark, p.district, p.city, p.country].map(text).filter(Boolean).join(', ');
export const labelsOf = (p) => text(p.labels).split(',').map((s) => s.trim()).filter(Boolean);
export const unique = (list) => [...new Set(list.map(text).filter(Boolean))].sort((a, b) => a.localeCompare(b));

export function coordsOf(p) {
  const lat = Number(p.lat);
  const lng = Number(p.lng);
  return text(p.lat) && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

export function formatKm(d) {
  return d < 1 ? `${Math.round(d * 1000)} m` : `${d.toFixed(d < 10 ? 1 : 0)} km`;
}

export function mapsHref(p) {
  const link = httpsUrl(p.mapsLink);
  if (link) return link;
  const params = new URLSearchParams({ api: '1', query: [p.name, p.city, p.country].map(text).filter(Boolean).join(' ') });
  if (p.placeId) params.set('query_place_id', p.placeId);
  return `https://www.google.com/maps/search/?${params}`;
}

// Name, location and Google Maps link on three lines, ready to paste into a chat.
export const placeText = (p) => [text(p.name), locationOf(p), mapsHref(p)].filter(Boolean).join('\n');

let toastTimer;
export function toast(msg) {
  const box = $('toast');
  box.textContent = msg;
  box.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { box.hidden = true; }, 2000);
}

// Clipboard API first; older iPhone Safari or a blocked clipboard falls back to a hidden textarea.
export async function copyText(value, done = 'Copied') {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const area = el('textarea', { value, readOnly: true, className: 'offscreen' });
    document.body.append(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    if (!ok) return toast('Copy is blocked on this browser');
  }
  toast(done);
}

export const canShare = () => typeof navigator.share === 'function';

export async function sharePlace(p) {
  try {
    await navigator.share({ title: text(p.name), text: placeText(p) });
  } catch (err) {
    if (err.name !== 'AbortError') toast('Could not open the share menu');
  }
}

const VIEWS = ['list', 'place', 'form', 'add', 'dish', 'setup'];

// Shows one view. push adds a history entry, so the phone's Back button returns to the previous view.
export function show(view, push = false) {
  for (const v of VIEWS) $(`view-${v}`).hidden = v !== view;
  if (push) history.pushState({ view }, '');
  else history.replaceState({ view }, '');
  window.scrollTo(0, 0);
}

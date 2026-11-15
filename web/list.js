// The All, Wishlist and Near me tabs: one list with shared filters, sorted by score or by distance.

import { state } from './state.js';
import { $, el, text, areaOf, coordsOf, formatKm } from './ui.js';
import { distanceKm } from './geo.js';
import { openPlace } from './place.js';

const LABELS = ['tipe', 'genre', 'jenis'];
const FILTERS = [...LABELS, 'city'];

// A score's rank is its position in the Master "Ratings" list (last = best); 0 when empty or unknown.
const rankOf = (score) => state.options.rating.indexOf(text(score)) + 1;

function averageRank(p) {
  const ranks = [p.rating1, p.rating2].map(rankOf).filter(Boolean);
  return ranks.length ? ranks.reduce((a, b) => a + b) / ranks.length : 0;
}

function fillSelect(select, values, allLabel) {
  const current = select.value;
  select.replaceChildren(el('option', { value: '', textContent: allLabel }),
    ...values.map((v) => el('option', { value: v, textContent: v })));
  select.value = values.includes(current) ? current : '';
}

export function renderFilters() {
  const unique = (list) => [...new Set(list.map(text).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const names = { tipe: 'Any tipe', genre: 'Any genre', jenis: 'Any jenis', city: 'Any city' };
  for (const f of FILTERS) fillSelect($(`filter-${f}`), unique(state.places.map((p) => p[f])), names[f]);
}

const badge = (label, cls = '') => el('span', { className: `badge ${cls}`, textContent: label });

function placeCard(p, distance) {
  const scores = state.people
    .map((name, i) => text(p[`rating${i + 1}`]) && `${name} ${text(p[`rating${i + 1}`])}`)
    .filter(Boolean).join(' · ');
  const open = el('button', { type: 'button', className: 'card-main' },
    el('h3', { textContent: text(p.name) }),
    el('p', { className: 'meta', textContent: [areaOf(p), Number.isFinite(distance) ? formatKm(distance) : ''].filter(Boolean).join(' — ') }),
    el('p', { className: 'meta', textContent: LABELS.map((f) => text(p[f])).filter(Boolean).join(' · ') }),
    scores ? el('p', { className: 'scores', textContent: scores }) : null,
    el('p', { className: 'badges' }, p.tried ? badge('Tried') : badge('Wishlist', 'wish'), p.closed ? badge('Closed') : null));
  open.addEventListener('click', () => openPlace(p.id));
  return el('li', { className: 'card' }, open);
}

export function renderList() {
  const near = state.tab === 'near';
  $('near-bar').hidden = !near;
  const q = $('search').value.trim().toLowerCase();
  const picked = FILTERS.map((f) => [f, $(`filter-${f}`).value]).filter(([, v]) => v);
  const showClosed = $('show-closed').checked;
  const wishlistOnly = state.tab === 'wishlist' || (near && $('near-wishlist').checked);
  const list = state.places.filter((p) => (showClosed || !p.closed)
    && (!wishlistOnly || !p.tried)
    && picked.every(([f, v]) => text(p[f]) === v)
    && (!q || [p.name, p.landmark, p.district, p.city, p.country, p.bestDish, ...LABELS.map((f) => p[f])]
      .join(' ').toLowerCase().includes(q)));

  const distance = new Map();
  if (near && state.here) {
    list.forEach((p) => distance.set(p, coordsOf(p) ? distanceKm(state.here, coordsOf(p)) : Infinity));
    list.sort((a, b) => distance.get(a) - distance.get(b));
  } else {
    const rank = new Map(list.map((p) => [p, averageRank(p)]));
    list.sort((a, b) => rank.get(b) - rank.get(a) || text(a.name).localeCompare(text(b.name)));
  }
  $('places').replaceChildren(...list.map((p) => placeCard(p, distance.get(p))));
  $('count').textContent = `${list.length} of ${state.places.length} places`;
}

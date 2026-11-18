// The All, Wishlist and Near me tabs: one list with shared filters, sorted by score or by distance.

import { state } from './state.js';
import { $, el, text, unique, areaOf, labelsOf, coordsOf, formatKm, placeText, copyText, toast } from './ui.js';
import { distanceKm } from './geo.js';
import { openPlace } from './place.js';
import { coverOf, photoImg } from './photos.js';

const LABELS = ['tipe', 'genre', 'jenis'];
const FILTERS = [...LABELS, 'city'];
const pickedLabels = new Set(); // label chips turned on; a place must carry all of them
let shown = []; // places on screen, in order, for "Copy list"

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

function renderLabelChips() {
  const all = unique(state.places.flatMap(labelsOf));
  for (const l of [...pickedLabels]) if (!all.includes(l)) pickedLabels.delete(l);
  $('label-chips').hidden = !all.length;
  $('label-chips').replaceChildren(...all.map((l) => {
    const chip = el('button', { type: 'button', className: 'chip', textContent: l });
    chip.setAttribute('aria-pressed', String(pickedLabels.has(l)));
    chip.addEventListener('click', () => {
      if (pickedLabels.has(l)) pickedLabels.delete(l);
      else pickedLabels.add(l);
      renderLabelChips();
      renderList();
    });
    return chip;
  }));
}

export function renderFilters() {
  const names = { tipe: 'Any tipe', genre: 'Any genre', jenis: 'Any jenis', city: 'Any city' };
  for (const f of FILTERS) fillSelect($(`filter-${f}`), unique(state.places.map((p) => p[f])), names[f]);
  renderLabelChips();
}

const badge = (label, cls = '') => el('span', { className: `badge ${cls}`, textContent: label });

function placeCard(p, distance) {
  const scores = state.people
    .map((name, i) => text(p[`rating${i + 1}`]) && `${name} ${text(p[`rating${i + 1}`])}`)
    .filter(Boolean).join(' · ');
  const labels = labelsOf(p);
  const cover = coverOf(p);
  const open = el('button', { type: 'button', className: 'card-main' },
    cover ? photoImg(cover, 200, 'card-thumb') : null,
    el('h3', { textContent: text(p.name) }),
    el('p', { className: 'meta', textContent: [areaOf(p), Number.isFinite(distance) ? formatKm(distance) : ''].filter(Boolean).join(' — ') }),
    el('p', { className: 'meta', textContent: LABELS.map((f) => text(p[f])).filter(Boolean).join(' · ') }),
    scores ? el('p', { className: 'scores', textContent: scores }) : null,
    el('p', { className: 'badges' }, p.tried ? badge('Tried') : badge('Wishlist', 'wish'), p.closed ? badge('Closed') : null,
      ...labels.map((l) => badge(l, 'label'))));
  open.addEventListener('click', () => openPlace(p.id));
  const copy = el('button', { type: 'button', className: 'icon-button', textContent: '⧉', title: 'Copy name, location and link' });
  copy.setAttribute('aria-label', `Copy ${text(p.name)}`);
  copy.addEventListener('click', () => copyText(placeText(p)));
  return el('li', { className: 'card' }, open, copy);
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
    && [...pickedLabels].every((l) => labelsOf(p).includes(l))
    && (!q || [p.name, p.landmark, p.district, p.city, p.country, p.bestDish, p.labels, ...LABELS.map((f) => p[f])]
      .join(' ').toLowerCase().includes(q)));

  const distance = new Map();
  if (near && state.here) {
    list.forEach((p) => distance.set(p, coordsOf(p) ? distanceKm(state.here, coordsOf(p)) : Infinity));
    list.sort((a, b) => distance.get(a) - distance.get(b));
  } else {
    const rank = new Map(list.map((p) => [p, averageRank(p)]));
    list.sort((a, b) => rank.get(b) - rank.get(a) || text(a.name).localeCompare(text(b.name)));
  }
  shown = list;
  $('places').replaceChildren(...list.map((p) => placeCard(p, distance.get(p))));
  $('count').textContent = `${list.length} of ${state.places.length} places`;
}

export function copyList() {
  if (!shown.length) return toast('Nothing to copy');
  copyText(shown.map(placeText).join('\n\n'), `Copied ${shown.length} place${shown.length === 1 ? '' : 's'}`);
}

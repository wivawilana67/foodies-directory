// UI: list + filters + near me, add place (paste link / type name / Android share), first-run setup.
// All place text is inserted with textContent, never innerHTML.

import { call, getSettings, saveSettings, readCache, writeCache } from './api.js';
import { distanceKm, getPosition } from './geo.js';

const $ = (id) => document.getElementById(id);
const LABELS = ['tipe', 'genre', 'jenis'];
const state = { places: [], fields: [], here: null };

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((c) => c !== null && c !== undefined && c !== ''));
  return node;
}

function show(view) {
  for (const name of ['list', 'add', 'setup']) $(`view-${name}`).hidden = name !== view;
  document.querySelectorAll('[data-view]').forEach((b) => {
    b.setAttribute('aria-current', b.dataset.view === view ? 'page' : 'false');
  });
}

const setStatus = (text) => { $('status').textContent = text; };
const setAddStatus = (text) => { $('add-status').textContent = text; };
const setSetupStatus = (text) => { $('setup-status').textContent = text; };

const text = (v) => String(v ?? '').trim();
const categoriesOf = (p) => [p.googleCategory, ...LABELS.map((f) => p[f])].map(text).filter(Boolean);
const areaOf = (p) => text(p.city) || text(p.area);

function coordsOf(p) {
  const lat = Number(p.lat);
  const lng = Number(p.lng);
  return text(p.lat) && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

function formatKm(d) {
  return d < 1 ? `${Math.round(d * 1000)} m` : `${d.toFixed(d < 10 ? 1 : 0)} km`;
}

function mapsHref(p) {
  for (const url of [p.mapsUrl, p.link]) if (/^https:\/\//.test(text(url))) return text(url);
  const params = new URLSearchParams({ api: '1', query: [p.name, areaOf(p)].filter(Boolean).join(' ') });
  if (p.placeId) params.set('query_place_id', p.placeId);
  return `https://www.google.com/maps/search/?${params}`;
}

function fillSelect(select, values, allLabel) {
  const current = select.value;
  select.replaceChildren(el('option', { value: '', textContent: allLabel }),
    ...values.map((v) => el('option', { value: v, textContent: v })));
  select.value = values.includes(current) ? current : '';
}

function renderFilters() {
  const unique = (list) => [...new Set(list)].sort((a, b) => a.localeCompare(b));
  fillSelect($('filter-category'), unique(state.places.flatMap(categoriesOf)), 'Any craving');
  fillSelect($('filter-area'), unique(state.places.map(areaOf).filter(Boolean)), 'Any city');
  $('filter-untried-wrap').hidden = !state.fields.includes('tried');
}

function placeCard(p, distance) {
  const meta = [categoriesOf(p).join(' · '), areaOf(p), Number.isFinite(distance) ? formatKm(distance) : '']
    .filter(Boolean).join(' — ');
  return el('li', { className: 'card' },
    el('div', { className: 'card-body' },
      el('h3', { textContent: text(p.name) }),
      el('p', { className: 'meta', textContent: meta }),
      p.tried ? el('span', { className: 'badge', textContent: 'Tried' }) : null),
    el('a', { className: 'button', href: mapsHref(p), target: '_blank', rel: 'noopener', textContent: 'Maps' }));
}

function render() {
  const q = $('search').value.trim().toLowerCase();
  const category = $('filter-category').value;
  const area = $('filter-area').value;
  const untried = $('filter-untried').checked && state.fields.includes('tried');
  const list = state.places.filter((p) =>
    (!q || [p.name, p.address, areaOf(p), ...categoriesOf(p)].join(' ').toLowerCase().includes(q))
    && (!category || categoriesOf(p).includes(category))
    && (!area || areaOf(p) === area)
    && (!untried || !p.tried));
  const distance = new Map();
  if (state.here) {
    list.forEach((p) => distance.set(p, coordsOf(p) ? distanceKm(state.here, coordsOf(p)) : Infinity));
    list.sort((a, b) => distance.get(a) - distance.get(b));
  }
  $('places').replaceChildren(...list.map((p) => placeCard(p, distance.get(p))));
  $('count').textContent = `${list.length} of ${state.places.length} places`;
}

function apply(data) {
  state.places = data.places;
  state.fields = data.fields;
  writeCache({ places: data.places, fields: data.fields });
  renderFilters();
  render();
}

async function refresh() {
  setStatus('Loading…');
  try {
    apply(await call('list'));
    setStatus('');
  } catch (err) {
    setStatus(`Showing the saved list. ${err.message}`);
  }
}

async function toggleNearMe() {
  const button = $('near-me');
  if (state.here) {
    state.here = null;
    button.setAttribute('aria-pressed', 'false');
    render();
    return;
  }
  setStatus('Finding your location…');
  try {
    state.here = await getPosition();
    button.setAttribute('aria-pressed', 'true');
    setStatus('');
  } catch (err) {
    setStatus(`Location unavailable: ${err.message}`);
  }
  render();
}

function resultCard(place) {
  const button = el('button', { type: 'button', className: 'button primary', textContent: 'Save' });
  button.addEventListener('click', () => save(place, button));
  return el('li', { className: 'card' },
    el('div', { className: 'card-body' },
      el('h3', { textContent: place.name }),
      el('p', { className: 'meta', textContent: [place.googleCategory, place.address].filter(Boolean).join(' — ') })),
    button);
}

async function lookup(event) {
  event.preventDefault();
  const input = $('add-input').value.trim();
  if (!input) return;
  setAddStatus('Looking up…');
  $('results').replaceChildren();
  try {
    const { places } = await call('lookup', { input });
    $('results').replaceChildren(...places.map(resultCard));
    setAddStatus(places.length ? 'Pick the right place:' : 'No match. Try adding the city to the name.');
  } catch (err) {
    setAddStatus(err.message);
  }
}

async function save(place, button) {
  button.disabled = true;
  const labels = Object.fromEntries(LABELS.map((f) => [f, $(`label-${f}`).value.trim()]));
  try {
    const { duplicate } = await call('add', { placeId: place.placeId, labels });
    $('add-form').reset();
    $('results').replaceChildren();
    setAddStatus(duplicate ? `${place.name} is already in the list.` : `Saved ${place.name}.`);
    await refresh();
  } catch (err) {
    button.disabled = false;
    setAddStatus(err.message);
  }
}

async function paste() {
  try {
    $('add-input').value = await navigator.clipboard.readText();
  } catch {
    setAddStatus('Paste is blocked here. Long-press the box and choose Paste.');
  }
}

async function saveSetup(event) {
  event.preventDefault();
  try {
    saveSettings($('setup-url').value.trim(), $('setup-token').value.trim());
  } catch (err) {
    setSetupStatus(err.message);
    return;
  }
  setSetupStatus('Checking…');
  try {
    apply(await call('list'));
    setSetupStatus('');
    show($('add-input').value ? 'add' : 'list');
  } catch (err) {
    setSetupStatus(`Saved, but the check failed: ${err.message}`);
  }
}

// Android share target opens ./?title=…&text=…&url=… (see manifest.webmanifest).
function readShare() {
  const params = new URLSearchParams(location.search);
  const shared = ['url', 'text', 'title'].map((k) => params.get(k)).filter(Boolean).join('\n');
  if (shared) history.replaceState(null, '', location.pathname);
  return shared;
}

function init() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
  document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => show(b.dataset.view)));
  for (const id of ['search', 'filter-category', 'filter-area', 'filter-untried']) $(id).addEventListener('input', render);
  $('near-me').addEventListener('click', toggleNearMe);
  $('refresh').addEventListener('click', refresh);
  $('add-form').addEventListener('submit', lookup);
  $('paste').addEventListener('click', paste);
  $('setup-form').addEventListener('submit', saveSetup);

  $('add-input').value = readShare();
  const settings = getSettings();
  $('setup-url').value = settings.url;
  $('setup-token').value = settings.token;
  if (!settings.url || !settings.token) {
    show('setup');
    return;
  }
  const cached = readCache();
  state.places = cached.places;
  state.fields = cached.fields;
  renderFilters();
  render();
  show($('add-input').value ? 'add' : 'list');
  refresh();
}

init();

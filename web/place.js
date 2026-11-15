// Place detail and the add / edit form. Edits send only changed fields plus the values they started from,
// so the backend can refuse a save that would overwrite a change made elsewhere.

import { call } from './api.js';
import { state, changed, placeById, upsert } from './state.js';
import { $, el, text, httpsUrl, mapsHref, show } from './ui.js';
import { dishList } from './dishes.js';

const NEW = '__new__';
const CHECKS = ['tried', 'closed'];

// [field, label, kind]; kinds: text, url, choice (Master list + add new), rating, note, check.
function formFields() {
  const [p1, p2] = state.people;
  return [
    ['name', 'Name', 'text'],
    ['country', 'Country', 'text'],
    ['city', 'City', 'text'],
    ['district', 'District / area', 'text'],
    ['landmark', 'Street / landmark', 'text'],
    ['tipe', 'Tipe', 'choice'],
    ['genre', 'Genre', 'choice'],
    ['jenis', 'Jenis', 'choice'],
    ['tried', 'We have tried it', 'check'],
    ['rating1', `${p1}'s score`, 'rating'],
    ['review1', `${p1}'s review`, 'note'],
    ['rating2', `${p2}'s score`, 'rating'],
    ['review2', `${p2}'s review`, 'note'],
    ['price', 'Price per person', 'text'],
    ['instagram', 'Instagram (link or @name)', 'url'],
    ['mapsLink', 'Google Maps link', 'url'],
    ['closed', 'Closed for good', 'check'],
  ];
}

const sameValue = (f, a, b) => (CHECKS.includes(f) ? Boolean(a) === Boolean(b) : text(a) === text(b));

export function openPlace(id) {
  state.current = id;
  $('place-status').textContent = '';
  renderPlace();
  show('place', true);
}

async function update(p, changes) {
  const original = Object.fromEntries(Object.keys(changes).map((f) => [f, p[f]]));
  const { place } = await call('update', { id: p.id, changes, original });
  upsert(state.places, place);
  changed();
  return place;
}

function section(title, ...children) {
  return el('section', { className: 'detail-section' }, el('h3', { textContent: title }), ...children);
}

export function renderPlace() {
  const p = placeById(state.current);
  if (!p) return;
  const status = $('place-status');
  const tried = el('button', { type: 'button', className: 'button', textContent: p.tried ? 'Move to wishlist' : 'Mark as tried' });
  tried.addEventListener('click', async () => {
    tried.disabled = true;
    status.textContent = 'Saving…';
    try {
      await update(p, { tried: !p.tried });
      status.textContent = '';
      renderPlace();
    } catch (err) {
      tried.disabled = false;
      status.textContent = err.message;
    }
  });
  const edit = el('button', { type: 'button', className: 'button', textContent: 'Edit' });
  edit.addEventListener('click', () => openForm({ place: p }));
  const instagram = httpsUrl(p.instagram);

  const people = state.people.map((name, i) => el('div', { className: 'person' },
    el('p', { className: 'score' }, el('strong', { textContent: name }), ` ${text(p[`rating${i + 1}`]) || '—'}`),
    text(p[`review${i + 1}`]) ? el('p', { className: 'review', textContent: text(p[`review${i + 1}`]) }) : null));

  $('place-detail').replaceChildren(
    el('h2', { textContent: text(p.name) }),
    el('p', { className: 'meta', textContent: [p.landmark, p.district, p.city, p.country].map(text).filter(Boolean).join(', ') }),
    el('p', { className: 'meta', textContent: ['tipe', 'genre', 'jenis'].map((f) => text(p[f])).filter(Boolean).join(' · ') }),
    el('p', { className: 'badges' },
      el('span', { className: `badge ${p.tried ? '' : 'wish'}`, textContent: p.tried ? 'Tried' : 'Wishlist' }),
      p.closed ? el('span', { className: 'badge', textContent: 'Closed' }) : null),
    el('div', { className: 'row' },
      el('a', { className: 'button primary', href: mapsHref(p), target: '_blank', rel: 'noopener', textContent: 'Maps' }),
      instagram ? el('a', { className: 'button', href: instagram, target: '_blank', rel: 'noopener', textContent: 'Instagram' }) : null,
      tried, edit),
    section('Scores', ...people),
    section('Price per person', el('p', { textContent: text(p.price) || '—' })),
    section('Best dish', el('p', { textContent: text(p.bestDish) || 'Star a dish below to set it.' })),
    section('Dishes', dishList(p)),
    el('p', { className: 'muted', textContent: text(p.address) }));
}

// A select filled from a Master list, with "+ Add new…" revealing a text box.
function choiceControl(values, current) {
  const list = [...values];
  if (text(current) && !list.includes(text(current))) list.push(text(current));
  const select = el('select', {},
    el('option', { value: '', textContent: '—' }),
    ...list.map((v) => el('option', { value: v, textContent: v })),
    el('option', { value: NEW, textContent: '+ Add new…' }));
  select.value = text(current);
  const input = el('input', { maxLength: 100, placeholder: 'New value', hidden: true });
  select.addEventListener('change', () => {
    input.hidden = select.value !== NEW;
    if (!input.hidden) input.focus();
  });
  return { nodes: [select, input], value: () => (select.value === NEW ? input.value.trim() : select.value) };
}

function control(field, kind, current) {
  if (kind === 'choice') return choiceControl(state.options[field] || [], current);
  if (kind === 'rating') {
    const values = [...state.options.rating];
    if (text(current) && !values.includes(text(current))) values.push(text(current));
    const select = el('select', {}, el('option', { value: '', textContent: '—' }),
      ...values.map((v) => el('option', { value: v, textContent: v })));
    select.value = text(current);
    return { nodes: [select], value: () => select.value };
  }
  if (kind === 'check') {
    const box = el('input', { type: 'checkbox', checked: Boolean(current) });
    return { nodes: [box], value: () => box.checked };
  }
  // url fields stay type="text" so "@name" is accepted; inputMode still brings up the URL keyboard.
  const input = kind === 'note'
    ? el('textarea', { rows: 3, maxLength: 1000, value: text(current) })
    : el('input', { type: 'text', maxLength: 200, value: text(current) });
  if (kind === 'url') Object.assign(input, { inputMode: 'url', autocapitalize: 'off' });
  return { nodes: [input], value: () => input.value.trim() };
}

// place: edit an existing place. google: a lookup result to add. manual: {name} for a place not on Google Maps.
export function openForm({ place, google, manual }) {
  const start = place || (google
    ? { name: google.name, country: google.country, city: google.city, district: google.district, mapsLink: google.mapsUrl }
    : { name: manual?.name || '' });
  const controls = {};
  $('form-title').textContent = place ? `Edit ${text(place.name)}` : 'New place';
  $('form-fields').replaceChildren(...formFields().map(([field, label, kind]) => {
    controls[field] = control(field, kind, start[field]);
    return el('label', { className: kind === 'check' ? 'check' : '' },
      kind === 'check' ? null : label, ...controls[field].nodes, kind === 'check' ? label : null);
  }));
  $('form-status').textContent = google ? `From Google: ${text(google.address)}` : '';
  $('place-form').onsubmit = (event) => {
    event.preventDefault();
    const values = Object.fromEntries(Object.entries(controls).map(([f, c]) => [f, c.value()]));
    save(place, google, values);
  };
  show('form', true);
}

async function save(place, google, values) {
  const status = $('form-status');
  const button = $('place-form').querySelector('[type="submit"]');
  button.disabled = true;
  status.textContent = 'Saving…';
  try {
    if (place) {
      const changes = Object.fromEntries(Object.entries(values).filter(([f, v]) => !sameValue(f, v, place[f])));
      if (Object.keys(changes).length) await update(place, changes);
      history.back();
      return;
    }
    if (!values.name) throw new Error('Name is required');
    const { duplicate, place: saved } = await call('add', { placeId: google?.placeId || '', fields: values });
    upsert(state.places, saved);
    changed();
    $('add-form').reset();
    $('results').replaceChildren();
    $('add-status').textContent = '';
    state.current = saved.id;
    renderPlace();
    show('place');
    $('place-status').textContent = duplicate ? 'This place was already in your list.' : 'Saved.';
  } catch (err) {
    status.textContent = err.message;
  } finally {
    button.disabled = false;
  }
}

// Add tab: paste a Google Maps link or type a name, look it up once, pick a result, then fill the form.
// Android can also share a link straight in (manifest share_target); iPhone uses Paste or long-press paste.

import { call } from './api.js';
import { $, el, text } from './ui.js';
import { openForm } from './place.js';

const setAddStatus = (msg) => { $('add-status').textContent = msg; };

function resultCard(place) {
  const pick = el('button', { type: 'button', className: 'button primary', textContent: 'Pick' });
  pick.addEventListener('click', () => openForm({ google: place }));
  return el('li', { className: 'card' },
    el('div', { className: 'card-body' },
      el('h3', { textContent: text(place.name) }),
      el('p', { className: 'meta', textContent: [place.googleCategory, place.address].map(text).filter(Boolean).join(' — ') })),
    pick);
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

async function paste() {
  try {
    $('add-input').value = await navigator.clipboard.readText();
  } catch {
    setAddStatus('Paste is blocked here. Long-press the box and choose Paste.');
  }
}

function addManual() {
  const input = $('add-input').value.trim();
  openForm({ manual: { name: /^https?:\/\//.test(input) ? '' : input } });
}

// Android share target opens ./?title=…&text=…&url=… (see manifest.webmanifest).
export function readShare() {
  const params = new URLSearchParams(location.search);
  const shared = ['url', 'text', 'title'].map((k) => params.get(k)).filter(Boolean).join('\n');
  if (shared) history.replaceState(null, '', location.pathname);
  return shared;
}

export function initAdd() {
  $('add-form').addEventListener('submit', lookup);
  $('paste').addEventListener('click', paste);
  $('add-manual').addEventListener('click', addManual);
  $('add-input').value = readShare();
}

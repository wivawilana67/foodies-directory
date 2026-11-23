// Dishes of a place: the list on the detail view and the add / edit dish form.

import { call } from './api.js';
import { state, changed, placeById, dishesOf, upsert } from './state.js';
import { $, el, text, show } from './ui.js';
import { MAX_PHOTOS, photoIdsOf, photoImg, addPhotoButton } from './photos.js';

const LIKED = { Yes: '👍', No: '👎' };
let editing = null; // {place, dish}

export function dishList(p) {
  const items = dishesOf(p.id).map((d) => {
    const open = el('button', { type: 'button', className: 'dish' },
      el('span', { className: 'dish-name', textContent: [LIKED[d.liked], text(d.name), d.best ? '⭐' : ''].filter(Boolean).join(' ') }),
      text(d.price) ? el('span', { className: 'muted', textContent: text(d.price) }) : null,
      text(d.note) ? el('span', { className: 'dish-note muted', textContent: text(d.note) }) : null);
    open.addEventListener('click', () => openDish(p, d));
    return el('li', {}, open);
  });
  const add = el('button', { type: 'button', className: 'button', textContent: '+ Add dish' });
  add.addEventListener('click', () => openDish(p, null));
  return el('div', {}, items.length ? el('ul', { className: 'dishes' }, ...items) : el('p', { className: 'muted', textContent: 'No dishes yet.' }), add);
}

function renderDishPhotos() {
  const { dish } = editing;
  if (!dish) {
    $('dish-photos').replaceChildren(el('p', { className: 'muted', textContent: 'Save the dish first to add photos.' }));
    return;
  }
  const current = state.dishes.find((d) => d.id === dish.id) || dish;
  const ids = photoIdsOf(current);
  const strip = ids.length ? el('div', { className: 'photo-strip' }, ...ids.map((id) => photoImg(id, 200, 'photo-small'))) : null;
  const add = ids.length < MAX_PHOTOS
    ? addPhotoButton('dish', dish.id, (msg) => { $('dish-status').textContent = msg; }, renderDishPhotos)
    : el('p', { className: 'muted', textContent: `Up to ${MAX_PHOTOS} photos. Remove one from View photos on the place.` });
  $('dish-photos').replaceChildren(...[strip, add].filter(Boolean));
}

function openDish(place, dish) {
  editing = { place, dish };
  $('dish-title').textContent = dish ? 'Edit dish' : `New dish at ${text(place.name)}`;
  $('dish-name').value = text(dish?.name);
  $('dish-price').value = text(dish?.price);
  $('dish-note').value = text(dish?.note);
  $('dish-best').checked = Boolean(dish?.best);
  document.querySelector(`input[name="dish-liked"][value="${dish?.liked || ''}"]`).checked = true;
  $('dish-delete').hidden = !dish;
  $('dish-delete').textContent = 'Delete';
  $('dish-status').textContent = '';
  renderDishPhotos();
  show('dish', true);
}

function setBestDish(placeId, bestDish) {
  const p = placeById(placeId);
  if (p && bestDish !== undefined) p.bestDish = bestDish;
}

async function save(event) {
  event.preventDefault();
  const { place, dish } = editing;
  const button = $('dish-form').querySelector('[type="submit"]');
  button.disabled = true;
  $('dish-status').textContent = 'Saving…';
  try {
    const result = await call('saveDish', {
      dish: {
        id: dish?.id || '',
        place: place.id,
        name: $('dish-name').value.trim(),
        price: $('dish-price').value.trim(),
        note: $('dish-note').value.trim(),
        liked: document.querySelector('input[name="dish-liked"]:checked').value,
        best: $('dish-best').checked,
      },
    });
    upsert(state.dishes, result.dish);
    setBestDish(place.id, result.bestDish);
    changed();
    history.back();
  } catch (err) {
    $('dish-status').textContent = err.message;
  } finally {
    button.disabled = false;
  }
}

// Two taps: the first asks, the second deletes.
async function remove() {
  const button = $('dish-delete');
  if (button.textContent === 'Delete') {
    button.textContent = 'Tap again to delete';
    return;
  }
  button.disabled = true;
  try {
    const result = await call('deleteDish', { id: editing.dish.id });
    state.dishes = state.dishes.filter((d) => d.id !== editing.dish.id);
    setBestDish(result.place, result.bestDish);
    changed();
    history.back();
  } catch (err) {
    $('dish-status').textContent = err.message;
  } finally {
    button.disabled = false;
  }
}

export function initDishes() {
  $('dish-form').addEventListener('submit', save);
  $('dish-delete').addEventListener('click', remove);
}

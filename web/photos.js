// Own photos of places and dishes: shrunk on the phone, uploaded to the backend (Drive), shown from Drive thumbnails.
// drive.google.com/thumbnail is widely used but undocumented (Unverified): test on both phones.

import { call } from './api.js';
import { state, changed, placeById, dishesOf, upsert } from './state.js';
import { $, el, text, show } from './ui.js';

export const MAX_PHOTOS = 5;
const MAX_SIDE = 1600;
const PHOTO_ID = /^[\w-]{10,200}$/;

export const photoIdsOf = (record) => text(record?.photos).split(',').map((s) => s.trim()).filter((s) => PHOTO_ID.test(s));
export const photoUrl = (id, width) => `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w${width}`;

export function photoImg(id, width, className = '') {
  return el('img', { src: photoUrl(id, width), alt: '', loading: 'lazy', decoding: 'async', referrerPolicy: 'no-referrer', className });
}

// A card's cover: the place's first photo, else the first photo of one of its dishes.
export const coverOf = (p) => photoIdsOf(p)[0] || dishesOf(p.id).flatMap(photoIdsOf)[0] || '';

// The browser applies the photo's rotation when it decodes, so the canvas comes out upright.
async function shrink(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode().catch(() => { throw new Error('Could not read that photo'); });
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = el('canvas', { width: Math.round(img.naturalWidth * scale), height: Math.round(img.naturalHeight * scale) });
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
    if (!blob) throw new Error('Could not read that photo');
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    return dataUrl.slice(dataUrl.indexOf(',') + 1);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function store(result) {
  if (result.place) upsert(state.places, result.place);
  if (result.dish) upsert(state.dishes, result.dish);
  changed();
}

const recordOf = (target, id) => (target === 'place' ? placeById(id) : state.dishes.find((d) => d.id === id));

async function upload(target, id, files, status) {
  const room = MAX_PHOTOS - photoIdsOf(recordOf(target, id)).length;
  const picked = [...files].slice(0, Math.max(room, 0));
  if (!picked.length) {
    status(`Up to ${MAX_PHOTOS} photos each`);
    return;
  }
  const n = picked.length;
  for (const [i, file] of picked.entries()) {
    status(`Uploading ${i + 1} of ${n}…`);
    store(await call('addPhoto', { target, id, data: await shrink(file) }));
  }
  status(n < files.length ? `Added ${n}; up to ${MAX_PHOTOS} photos each` : '');
}

// A label opens the picker reliably on iPhone Safari and Android; both offer camera or library.
export function addPhotoButton(target, id, status, done) {
  const input = el('input', { type: 'file', accept: 'image/*', multiple: true, className: 'offscreen' });
  input.addEventListener('change', async () => {
    input.disabled = true;
    try {
      await upload(target, id, input.files, status);
    } catch (err) {
      status(err.message);
    } finally {
      input.value = '';
      input.disabled = false;
      done();
    }
  });
  return el('label', { className: 'button' }, '+ Add photo', input);
}

export function openGallery() {
  renderGallery();
  show('photos', true);
}

export function renderGallery() {
  $('photo-viewer').hidden = true;
  const p = placeById(state.current);
  if (!p) return;
  $('photos-title').textContent = `Photos of ${text(p.name)}`;
  const groups = [
    { title: text(p.name), target: 'place', id: p.id, ids: photoIdsOf(p) },
    ...dishesOf(p.id).map((d) => ({ title: text(d.name), target: 'dish', id: d.id, ids: photoIdsOf(d) })),
  ].filter((g) => g.ids.length);
  const sections = groups.map((group) => el('section', { className: 'detail-section' },
    el('h3', { textContent: group.title }),
    el('div', { className: 'photo-grid' }, ...group.ids.map((photoId) => {
      const thumb = el('button', { type: 'button', className: 'photo-thumb' }, photoImg(photoId, 600));
      thumb.setAttribute('aria-label', `Open photo of ${group.title}`);
      thumb.addEventListener('click', () => openViewer(group, photoId));
      return thumb;
    }))));
  $('photos-body').replaceChildren(...(sections.length ? sections : [el('p', { className: 'muted', textContent: 'No photos yet.' })]));
  $('photos-status').textContent = '';
}

function openViewer(group, photoId) {
  $('viewer-img').src = photoUrl(photoId, 1600);
  $('viewer-caption').textContent = group.title;
  $('viewer-status').textContent = '';
  const remove = $('viewer-remove');
  remove.textContent = 'Remove';
  remove.disabled = false;
  // Two taps: the first asks, the second deletes.
  remove.onclick = async () => {
    if (remove.textContent === 'Remove') {
      remove.textContent = 'Tap again to remove';
      return;
    }
    remove.disabled = true;
    try {
      store(await call('deletePhoto', { target: group.target, id: group.id, photoId }));
      history.back();
    } catch (err) {
      $('viewer-status').textContent = err.message;
      remove.disabled = false;
    }
  };
  $('photo-viewer').hidden = false;
  history.pushState({ view: 'photos' }, '');
}

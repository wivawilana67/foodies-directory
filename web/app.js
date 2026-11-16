// Entry point: loads the list, wires the bottom tabs, Near me, settings and install, and the Back button.

import { call, getSettings, saveSettings, readCache, writeCache } from './api.js';
import { getPosition } from './geo.js';
import { state, onChange, changed } from './state.js';
import { $, show } from './ui.js';
import { renderFilters, renderList, copyList } from './list.js';
import { renderPlace } from './place.js';
import { initDishes } from './dishes.js';
import { initAdd } from './add.js';

const setStatus = (msg) => { $('status').textContent = msg; };
const setSetupStatus = (msg) => { $('setup-status').textContent = msg; };

function apply(data) {
  state.places = data.places || [];
  state.dishes = data.dishes || [];
  state.options = { rating: [], tipe: [], genre: [], jenis: [], ...data.options };
  state.people = data.people?.length === 2 ? data.people : ['Person 1', 'Person 2'];
  state.fields = data.fields || [];
}

onChange(() => {
  const { places, dishes, options, people, fields } = state;
  writeCache({ places, dishes, options, people, fields });
  renderFilters();
  renderList();
});

async function refresh() {
  setStatus('Loading…');
  try {
    apply(await call('list'));
    changed();
    if (!$('view-place').hidden) renderPlace();
    setStatus('');
  } catch (err) {
    setStatus(`Showing the saved list. ${err.message}`);
  }
}

async function locate() {
  setStatus('Finding your location…');
  try {
    state.here = await getPosition();
    setStatus('');
  } catch (err) {
    setStatus(`Location unavailable: ${err.message}`);
  }
  renderList();
}

function selectTab(tab) {
  document.querySelectorAll('[data-tab]').forEach((b) => {
    b.setAttribute('aria-current', b.dataset.tab === tab ? 'page' : 'false');
  });
  if (tab === 'add') {
    show('add');
    return;
  }
  state.tab = tab;
  show('list');
  renderList();
  if (tab === 'near' && !state.here) locate();
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
    changed();
    setSetupStatus('');
    $('setup-back').hidden = false;
    selectTab($('add-input').value ? 'add' : 'all');
  } catch (err) {
    setSetupStatus(`Saved, but the check failed: ${err.message}`);
  }
}

// Android (Chrome): an "Install app" button when the browser offers it. iPhone: a hint, since Safari has no prompt.
function initInstall() {
  let deferred = null;
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferred = event;
    $('install').hidden = false;
  });
  window.addEventListener('appinstalled', () => { $('install').hidden = true; });
  $('install').addEventListener('click', async () => {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice;
    deferred = null;
    $('install').hidden = true;
  });
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const installed = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  $('ios-hint').hidden = !ios || installed;
}

function init() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
  document.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => selectTab(b.dataset.tab)));
  document.querySelectorAll('[data-back]').forEach((b) => b.addEventListener('click', () => history.back()));
  window.addEventListener('popstate', (event) => {
    const view = event.state?.view || 'list';
    if (view === 'place') renderPlace();
    show(view);
  });
  $('open-setup').addEventListener('click', () => show('setup', true));
  $('search').addEventListener('input', renderList);
  for (const id of ['filter-tipe', 'filter-genre', 'filter-jenis', 'filter-city', 'show-closed', 'near-wishlist']) {
    $(id).addEventListener('change', renderList);
  }
  $('locate').addEventListener('click', locate);
  $('refresh').addEventListener('click', refresh);
  $('copy-list').addEventListener('click', copyList);
  $('setup-form').addEventListener('submit', saveSetup);
  initAdd();
  initDishes();
  initInstall();

  const settings = getSettings();
  $('setup-url').value = settings.url;
  $('setup-token').value = settings.token;
  if (!settings.url || !settings.token) {
    $('setup-back').hidden = true;
    show('setup');
    return;
  }
  apply(readCache());
  renderFilters();
  selectTab($('add-input').value ? 'add' : 'all');
  refresh();
}

init();

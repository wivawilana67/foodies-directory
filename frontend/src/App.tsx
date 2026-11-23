import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AddPlace } from './AddPlace';
import { ApiError, api, hasToken, readCache, setToken, writeCache } from './api';
import { DishForm, type DishReply } from './DishForm';
import { PlaceDetail } from './PlaceDetail';
import { PlaceForm } from './PlaceForm';
import { PlaceList, type Tab } from './PlaceList';
import { Settings } from './Settings';
import { SignIn } from './SignIn';
import { Toast } from './Toast';
import type { Data, LookupResult, Place } from './types';

// App shell: sign-in, the saved copy of /api/bootstrap (instant start, offline), top bar, bottom tabs and the
// phone's Back button. Sub-views push a history entry holding the route; tabs replace it. The list and the Add tab
// stay mounted (hidden) under sub-views, so search, filters, lookup results and scroll position survive a visit.

// place / form / dish: `id` is the place; dish: `dish` is the dish (none = new); new: a place to add, from a
// lookup result (`google`) or typed by hand (`name`). `notice` is shown on a place just added.
type Route = {
  view: 'list' | 'settings' | 'place' | 'form' | 'dish' | 'new';
  id?: string; dish?: string; google?: LookupResult; name?: string; notice?: string;
};
const LIST: Route = { view: 'list' };
const TABS: [Tab | 'add', string, string][] = [
  ['all', '📋', 'All'],
  ['wishlist', '🔖', 'Wishlist'],
  ['near', '📍', 'Near me'],
  ['add', '➕', 'Add'],
];

// Android's share target opens ./?title=…&text=…&url=… (manifest share_target); the shared text goes to the Add
// tab. Read once at load, before the address is cleaned.
function readShare() {
  const params = new URLSearchParams(location.search);
  const shared = ['url', 'text', 'title'].map((k) => params.get(k)).filter(Boolean).join('\n');
  if (shared) history.replaceState(LIST, '', location.pathname);
  return shared;
}
const SHARED = readShare();

// Chrome's install prompt event (not in TypeScript's DOM types).
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<unknown> };

const upsert = <T extends { id: string }>(list: T[], item: T) =>
  list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item];

export function App() {
  const [signedIn, setSignedIn] = useState(hasToken);
  const [signInMessage, setSignInMessage] = useState('');
  const [data, setData] = useState(readCache);
  const [status, setStatus] = useState('');
  const [tab, setTab] = useState<Tab>('all');
  const [adding, setAdding] = useState(Boolean(SHARED)); // the Add tab is showing
  const [addKey, setAddKey] = useState(0); // bumped after an add, to clear the Add tab
  const [route, setRoute] = useState<Route>(() => (history.state?.view ? history.state : LIST)); // a reload keeps the view
  const listScroll = useRef(0);
  const [install, setInstall] = useState<InstallPrompt | null>(null);

  // Signing out forgets the token and the saved list on this phone.
  const signOut = useCallback((message: string) => {
    setToken('');
    writeCache(null);
    setData(null);
    window.google?.accounts.id.disableAutoSelect();
    setSignInMessage(message);
    setSignedIn(false);
    history.replaceState(LIST, '');
    setRoute(LIST);
  }, []);

  const refresh = useCallback(async () => {
    setStatus('Loading…');
    try {
      const fresh = await api<Data>('/api/bootstrap');
      setData(fresh);
      writeCache(fresh);
      setStatus('');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) signOut(e.message);
      else setStatus(`Could not refresh: ${(e as Error).message}`);
    }
  }, [signOut]);

  useEffect(() => {
    if (signedIn) refresh();
  }, [signedIn, refresh]);

  useEffect(() => {
    const onPop = (event: PopStateEvent) => setRoute(event.state?.view ? event.state : LIST);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Android (Chrome): an "Install app" button when the browser offers it. iPhone gets a hint in Settings.
  useEffect(() => {
    const offer = (event: Event) => {
      event.preventDefault();
      setInstall(event as InstallPrompt);
    };
    const done = () => setInstall(null);
    window.addEventListener('beforeinstallprompt', offer);
    window.addEventListener('appinstalled', done);
    return () => {
      window.removeEventListener('beforeinstallprompt', offer);
      window.removeEventListener('appinstalled', done);
    };
  }, []);

  async function installApp() {
    if (!install) return;
    await install.prompt();
    await install.userChoice;
    setInstall(null);
  }

  // Back to the list returns to where it was scrolled; sub-views start at the top.
  useLayoutEffect(() => {
    window.scrollTo(0, route.view === 'list' ? listScroll.current : 0);
  }, [route]);

  const onToken = useCallback((token: string) => {
    setToken(token);
    setSignedIn(true);
  }, []);

  function open(next: Route) {
    if (route.view === 'list') listScroll.current = window.scrollY;
    history.pushState(next, '');
    setRoute(next);
  }

  function selectTab(next: Tab | 'add') {
    listScroll.current = 0;
    history.replaceState(LIST, '');
    setAdding(next === 'add');
    if (next !== 'add') setTab(next);
    setRoute(LIST);
  }

  // Every save updates the data and the offline copy.
  function change(edit: (d: Data) => Data) {
    setData((now) => {
      if (!now) return now;
      const next = edit(now);
      writeCache(next);
      return next;
    });
  }

  const savePlace = (place: Place) => change((d) => ({ ...d, places: upsert(d.places, place) }));

  // A new place (or the one already in the list) replaces the add form, so Back returns to the Add tab, cleared.
  function addedPlace(place: Place, duplicate?: boolean) {
    savePlace(place);
    setAddKey((k) => k + 1);
    const next: Route = { view: 'place', id: place.id, notice: duplicate ? 'This place was already in your list.' : 'Saved.' };
    history.replaceState(next, '');
    setRoute(next);
  }

  // A dish reply carries the place's new Best Dish (derived, so the place's version does not change).
  function saveDish(reply: DishReply, removed?: string) {
    const placeId = route.id;
    change((d) => ({
      ...d,
      dishes: removed ? d.dishes.filter((x) => x.id !== removed) : reply.dish ? upsert(d.dishes, reply.dish) : d.dishes,
      places: d.places.map((p) => (p.id === placeId ? { ...p, bestDish: reply.bestDish } : p)),
    }));
  }

  const me = data?.people.find((p) => p.id === data.me);
  const place = data?.places.find((p) => p.id === route.id);

  const gone = (what: string) => (
    <section>
      <button type="button" className="link" onClick={() => history.back()}>← Back</button>
      <p className="muted">This {what} is no longer in the list.</p>
    </section>
  );

  function subView(data: Data) {
    if (route.view === 'settings') return <Settings name={me?.name ?? ''} onSignOut={signOut} />;
    if (route.view === 'list') return null;
    if (route.view === 'new') return <PlaceForm google={route.google} name={route.name} data={data} onSaved={addedPlace} onRefresh={refresh} />;
    if (!place) return gone('place');
    if (route.view === 'form') {
      // Keyed by version: loading the latest version after a conflict starts the form afresh.
      return <PlaceForm key={`${place.id}:${place.version}`} place={place} data={data} onSaved={savePlace} onRefresh={refresh} />;
    }
    if (route.view === 'dish') {
      const dish = data.dishes.find((d) => d.id === route.dish);
      if (route.dish && !dish) return gone('dish');
      return <DishForm key={route.dish ?? 'new'} place={place} dish={dish} onSaved={saveDish} />;
    }
    return (
      <PlaceDetail key={place.id} place={place} data={data} notice={route.notice} onSaved={savePlace} onRefresh={refresh}
        onEdit={() => open({ view: 'form', id: place.id })} onDish={(dish) => open({ view: 'dish', id: place.id, dish })} />
    );
  }

  return (
    <>
      <header className="topbar">
        <h1>Foodies</h1>
        <div className="row">
          {install && <button type="button" className="topbar-button" onClick={installApp}>Install app</button>}
          {signedIn && (
            <button type="button" className="topbar-button" aria-label="Settings" onClick={() => open({ view: 'settings' })}>⚙</button>
          )}
        </div>
      </header>
      <main>
        {!signedIn ? (
          <SignIn message={signInMessage} onToken={onToken} />
        ) : !data ? (
          <div className="fields">
            <p className="muted" role="status">{status || 'Loading…'}</p>
            {status && status !== 'Loading…' && <button type="button" className="button" onClick={refresh}>Try again</button>}
          </div>
        ) : (
          <>
            <div hidden={route.view !== 'list' || adding}>
              <PlaceList data={data} tab={tab} status={status} onRefresh={refresh} onOpen={(id) => open({ view: 'place', id })} />
            </div>
            <div hidden={route.view !== 'list' || !adding}>
              <AddPlace key={addKey} shared={addKey ? '' : SHARED} onPick={(google) => open({ view: 'new', google })} onManual={(name) => open({ view: 'new', name })} />
            </div>
            {subView(data)}
          </>
        )}
      </main>
      <Toast />
      {signedIn && data && (
        <nav className="tabbar" aria-label="Sections">
          {TABS.map(([key, icon, label]) => (
            <button key={key} type="button" aria-current={route.view === 'list' && (key === 'add' ? adding : !adding && tab === key) ? 'page' : 'false'} onClick={() => selectTab(key)}>
              {icon}
              <span>{label}</span>
            </button>
          ))}
        </nav>
      )}
    </>
  );
}

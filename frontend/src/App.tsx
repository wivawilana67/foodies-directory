import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ApiError, api, hasToken, readCache, setToken, writeCache } from './api';
import { PlaceDetail } from './PlaceDetail';
import { PlaceForm } from './PlaceForm';
import { PlaceList, type Tab } from './PlaceList';
import { Settings } from './Settings';
import { SignIn } from './SignIn';
import { Toast } from './Toast';
import type { Data, Place } from './types';

// App shell: sign-in, the saved copy of /api/bootstrap (instant start, offline), top bar, bottom tabs and the
// phone's Back button. Sub-views (place, form, settings) push a history entry holding {view, id}; tabs replace it.
// The list stays mounted (hidden) under sub-views, so search, filters and scroll position survive a visit.

type Route = { view: 'list' | 'settings' | 'place' | 'form'; id?: string };
const LIST: Route = { view: 'list' };
const TABS: [Tab, string, string][] = [
  ['all', '📋', 'All'],
  ['wishlist', '🔖', 'Wishlist'],
  ['near', '📍', 'Near me'],
];

export function App() {
  const [signedIn, setSignedIn] = useState(hasToken);
  const [signInMessage, setSignInMessage] = useState('');
  const [data, setData] = useState(readCache);
  const [status, setStatus] = useState('');
  const [tab, setTab] = useState<Tab>('all');
  const [route, setRoute] = useState<Route>(() => (history.state?.view ? history.state : LIST)); // a reload keeps the view
  const listScroll = useRef(0);

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

  function selectTab(next: Tab) {
    listScroll.current = 0;
    history.replaceState(LIST, '');
    setTab(next);
    setRoute(LIST);
  }

  // A saved place replaces its old copy in the data and in the offline copy.
  function savePlace(place: Place) {
    setData((now) => {
      if (!now) return now;
      const next = { ...now, places: now.places.map((p) => (p.id === place.id ? place : p)) };
      writeCache(next);
      return next;
    });
  }

  const me = data?.people.find((p) => p.id === data.me);
  const place = data?.places.find((p) => p.id === route.id);

  function subView(data: Data) {
    if (route.view === 'settings') return <Settings name={me?.name ?? ''} onSignOut={signOut} />;
    if (route.view === 'list') return null;
    if (!place) {
      return (
        <section>
          <button type="button" className="link" onClick={() => history.back()}>← Back</button>
          <p className="muted">This place is no longer in the list.</p>
        </section>
      );
    }
    if (route.view === 'form') {
      // Keyed by version: loading the latest version after a conflict starts the form afresh.
      return <PlaceForm key={`${place.id}:${place.version}`} place={place} data={data} onSaved={savePlace} onRefresh={refresh} />;
    }
    return <PlaceDetail key={place.id} place={place} data={data} onEdit={() => open({ view: 'form', id: place.id })} onSaved={savePlace} onRefresh={refresh} />;
  }

  return (
    <>
      <header className="topbar">
        <h1>Foodies</h1>
        {signedIn && (
          <button type="button" className="topbar-button" aria-label="Settings" onClick={() => open({ view: 'settings' })}>⚙</button>
        )}
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
            <div hidden={route.view !== 'list'}>
              <PlaceList data={data} tab={tab} status={status} onRefresh={refresh} onOpen={(id) => open({ view: 'place', id })} />
            </div>
            {subView(data)}
          </>
        )}
      </main>
      <Toast />
      {signedIn && data && (
        <nav className="tabbar" aria-label="Sections">
          {TABS.map(([key, icon, label]) => (
            <button key={key} type="button" aria-current={route.view === 'list' && tab === key ? 'page' : 'false'} onClick={() => selectTab(key)}>
              {icon}
              <span>{label}</span>
            </button>
          ))}
        </nav>
      )}
    </>
  );
}
